"""Background parse worker.

One daemon thread, single source of truth for "should we ask OpenDota
about match X right now?". Pulls rows from ``player_match_details``
that are due for a check (see ``parse_queue.pick_batch``), respects the
shared ``opendota_budget`` token bucket, and never starves the
interactive request path: half the bucket is reserved for it by leaving
a soft "min tokens" floor before each iteration.

State transitions handled here:

    queued     -POST /request/{id}-> requested
    requested  -GET /matches/{id}-> parsed | queued (still parsing)
    parsed/unavailable                            (terminal, skipped)

If something throws we keep the row in its current state and bump
attempts so it falls back in the queue (with backoff). The worker never
crashes the process; transient OpenDota outages just slow it down.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from app.database import SessionLocal
from app.models import PlayerMatchDetail
from app.parse_queue import MAX_ATTEMPTS, pick_batch, reschedule
from app.rate_budget import opendota_budget
from app.sources import OpenDotaAdapter

logger = logging.getLogger(__name__)

# How often the worker wakes up. With a 60/min budget there's no point
# spinning faster than once per second; bigger sleeps are easier on the
# DB and on logs.
TICK_INTERVAL_SEC = int(os.getenv("PARSE_WORKER_TICK_SEC", "20"))
# Hard cap on rows touched per tick. Keeps a single tick from monopolizing
# the budget; the next tick handles the rest.
BATCH_LIMIT = int(os.getenv("PARSE_WORKER_BATCH", "25"))
# Soft floor of tokens we leave for interactive callers (a user opening
# /match/:id should never have to wait for the bucket).
RESERVE_TOKENS = int(os.getenv("PARSE_WORKER_RESERVE", "10"))

_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()
_state = {
    "running": False,
    "last_tick": None,
    "ticks": 0,
    "matches_parsed_total": 0,
    "matches_requested_total": 0,
    "errors": 0,
    "last_error": None,
}
_state_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _snapshot() -> dict:
    with _state_lock:
        return dict(_state)


def get_worker_status() -> dict:
    snap = _snapshot()
    snap["budget_available"] = round(opendota_budget.available(), 2)
    snap["budget_capacity"] = opendota_budget.capacity()
    return snap


def start_parse_worker() -> dict:
    global _thread
    if _thread and _thread.is_alive():
        return {"status": "already_running"}
    _stop_event.clear()
    with _state_lock:
        _state["running"] = True
    _thread = threading.Thread(target=_loop, name="parse_worker", daemon=True)
    _thread.start()
    return {"status": "started"}


def stop_parse_worker() -> dict:
    _stop_event.set()
    with _state_lock:
        _state["running"] = False
    return {"status": "stopped"}


def _loop() -> None:
    logger.info("parse_worker started; tick=%ss batch=%s reserve=%s",
                TICK_INTERVAL_SEC, BATCH_LIMIT, RESERVE_TOKENS)
    adapter = OpenDotaAdapter()
    while not _stop_event.is_set():
        try:
            _tick(adapter)
        except Exception as exc:  # noqa: BLE001 — never let one tick kill the thread
            logger.exception("parse_worker tick failed: %s", exc)
            with _state_lock:
                _state["errors"] += 1
                _state["last_error"] = str(exc)
        with _state_lock:
            _state["ticks"] += 1
            _state["last_tick"] = _now().isoformat()
        _stop_event.wait(TICK_INTERVAL_SEC)
    logger.info("parse_worker stopped")


def _tick(adapter: OpenDotaAdapter) -> None:
    # Skip ticks when the bucket is almost empty so the interactive
    # path (MatchDetailService on a page request) doesn't starve.
    if opendota_budget.available() < RESERVE_TOKENS:
        return

    db = SessionLocal()
    try:
        rows = pick_batch(db, BATCH_LIMIT)
        if not rows:
            return
        for row in rows:
            if _stop_event.is_set():
                break
            # Honour the reserve every iteration; if we drop below it we
            # leave the rest of the batch for the next tick.
            if opendota_budget.available() < RESERVE_TOKENS:
                break
            _process_row(db, row, adapter)
            db.commit()
    finally:
        db.close()


def _process_row(db, row: PlayerMatchDetail, adapter: OpenDotaAdapter) -> None:
    if row.parse_state == "queued":
        if not opendota_budget.take(timeout=2.0):
            return
        ok = False
        try:
            ok = adapter.request_parse(row.match_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("request_parse(%s) failed: %s", row.match_id, exc)

        if ok:
            row.parse_requested_at = _now()
            reschedule(row, state="requested", saw_attempt=False)
            with _state_lock:
                _state["matches_requested_total"] += 1
        else:
            # Could not even ask — count as an attempt so we eventually
            # give up if OpenDota systematically refuses this one.
            reschedule(row, state="queued", saw_attempt=True)
        return

    if row.parse_state == "requested":
        if not opendota_budget.take(timeout=2.0):
            return
        try:
            dto = adapter.fetch_match(row.match_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("fetch_match(%s) failed: %s", row.match_id, exc)
            reschedule(row, state="requested", saw_attempt=True)
            return

        if dto is None:
            # Sometimes OpenDota returns nothing transiently (429 burst,
            # network blip). Treat as "not yet" and back off.
            reschedule(row, state="requested", saw_attempt=True)
            return

        # Update cache with whatever we got, parsed or not.
        row.source = dto.source
        row.parser_version = dto.parser_version
        row.start_time = dto.start_time
        row.duration = dto.duration
        row.game_mode = dto.game_mode
        row.lobby_type = dto.lobby_type
        row.radiant_win = dto.radiant_win
        row.avg_rank_tier = dto.avg_rank_tier
        row.raw_json = dto.raw
        row.fetched_at = _now()

        if dto.is_parsed:
            row.is_parsed = True
            reschedule(row, state="parsed", saw_attempt=False)
            with _state_lock:
                _state["matches_parsed_total"] += 1
        else:
            # Still pending in OpenDota's pipeline — back off and recheck.
            reschedule(row, state="requested", saw_attempt=True)
        return

    # Defensive: any other state means we shouldn't have picked the row.
    if row.parse_state not in ("parsed", "unavailable"):
        logger.warning("parse_worker saw unknown state %r for %s; marking unavailable",
                       row.parse_state, row.match_id)
        reschedule(row, state="unavailable", saw_attempt=False)

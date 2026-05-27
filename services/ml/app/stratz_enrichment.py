"""Background STRATZ enrichment queue for recent player matches."""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.analytics_snapshots import rebuild_player_match_analytics
from app.database import SessionLocal
from app.models import PlayerMatch, PlayerMatchDetail, StratzMatchEnrichment
from app.parse_queue import ANALYSIS_WINDOW, PRIORITY_COLD, PRIORITY_WARM, WARM_HEAD_COUNT
from app.sources import MatchDetailDTO, StratzAdapter
from app.stratz_client import STRATZ_ENABLED, stratz_remaining

logger = logging.getLogger(__name__)

STRATZ_ENRICHMENT_ENABLED = os.getenv("STRATZ_ENRICHMENT_ENABLED", "true").lower() in ("true", "1", "yes")
STRATZ_ENRICHMENT_WINDOW = min(ANALYSIS_WINDOW, int(os.getenv("STRATZ_ENRICHMENT_MATCHES", str(ANALYSIS_WINDOW))))
STRATZ_ENRICHMENT_BATCH = max(1, int(os.getenv("STRATZ_ENRICHMENT_BATCH", "12")))
STRATZ_ENRICHMENT_TICK_SEC = max(5, int(os.getenv("STRATZ_ENRICHMENT_TICK_SEC", "30")))
STRATZ_MAX_ATTEMPTS = max(1, int(os.getenv("STRATZ_ENRICHMENT_MAX_ATTEMPTS", "4")))

TERMINAL_STATES = ("enriched", "skipped", "failed")

_thread: threading.Thread | None = None
_stop_event = threading.Event()
_state = {
    "running": False,
    "last_tick": None,
    "ticks": 0,
    "matches_enriched_total": 0,
    "errors": 0,
    "last_error": None,
}
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _backoff(attempts: int) -> timedelta:
    mins = [5, 15, 60, 180]
    return timedelta(minutes=mins[min(max(attempts, 0), len(mins) - 1)])


def get_worker_status() -> dict:
    with _lock:
        snap = dict(_state)
    snap["enabled"] = bool(STRATZ_ENABLED and STRATZ_ENRICHMENT_ENABLED)
    snap["quota"] = stratz_remaining()
    return snap


def start_stratz_worker() -> dict:
    global _thread
    if not STRATZ_ENABLED or not STRATZ_ENRICHMENT_ENABLED:
        return {"status": "disabled"}
    if _thread and _thread.is_alive():
        return {"status": "already_running"}
    _stop_event.clear()
    with _lock:
        _state["running"] = True
    _thread = threading.Thread(target=_loop, name="stratz_enrichment_worker", daemon=True)
    _thread.start()
    return {"status": "started"}


def stop_stratz_worker() -> dict:
    _stop_event.set()
    with _lock:
        _state["running"] = False
    return {"status": "stopped"}


def enqueue_for_account(db: Session, account_id: int, window: int = STRATZ_ENRICHMENT_WINDOW) -> dict:
    if not STRATZ_ENABLED or not STRATZ_ENRICHMENT_ENABLED:
        return {"enabled": False, "queued": 0, "already_done": 0}
    rows = (
        db.query(PlayerMatch.match_id, PlayerMatch.start_time)
        .filter(PlayerMatch.account_id == int(account_id))
        .order_by(PlayerMatch.start_time.desc().nullslast())
        .limit(window)
        .all()
    )
    queued = 0
    already_done = 0
    now = _now()
    for idx, (match_id, _start_time) in enumerate(rows):
        if not match_id:
            continue
        existing = db.query(StratzMatchEnrichment).filter(
            StratzMatchEnrichment.account_id == int(account_id),
            StratzMatchEnrichment.match_id == int(match_id),
        ).first()
        priority = PRIORITY_WARM if idx < WARM_HEAD_COUNT else PRIORITY_COLD
        if existing:
            if existing.state == "enriched":
                already_done += 1
            elif priority < (existing.priority or 99):
                existing.priority = priority
                existing.next_check_at = now
            continue
        db.add(StratzMatchEnrichment(
            account_id=int(account_id),
            match_id=int(match_id),
            state="queued",
            priority=priority,
            next_check_at=now,
        ))
        queued += 1
    db.flush()
    return {"enabled": True, "queued": queued, "already_done": already_done, "window": len(rows)}


def progress_for_account(db: Session, account_id: int, window: int = STRATZ_ENRICHMENT_WINDOW) -> dict:
    match_ids_q = (
        select(PlayerMatch.match_id)
        .filter(PlayerMatch.account_id == int(account_id))
        .order_by(PlayerMatch.start_time.desc().nullslast())
        .limit(window)
    )
    counts = (
        db.query(
            func.count().label("total"),
            func.sum(case((StratzMatchEnrichment.state == "enriched", 1), else_=0)).label("enriched"),
            func.sum(case((StratzMatchEnrichment.state == "queued", 1), else_=0)).label("queued"),
            func.sum(case((StratzMatchEnrichment.state == "running", 1), else_=0)).label("running"),
            func.sum(case((StratzMatchEnrichment.state == "failed", 1), else_=0)).label("failed"),
        )
        .filter(
            StratzMatchEnrichment.account_id == int(account_id),
            StratzMatchEnrichment.match_id.in_(match_ids_q),
        )
        .one()
    )
    loaded = db.query(func.count(PlayerMatch.id)).filter(PlayerMatch.account_id == int(account_id)).scalar() or 0
    window_size = min(int(loaded), window)
    enriched = int(counts.enriched or 0)
    pending = int(counts.queued or 0) + int(counts.running or 0)
    return {
        "enabled": bool(STRATZ_ENABLED and STRATZ_ENRICHMENT_ENABLED),
        "window": window_size,
        "stratz_enriched": enriched,
        "stratz_pending": pending,
        "stratz_failed": int(counts.failed or 0),
        "stratz_not_enqueued": max(window_size - int(counts.total or 0), 0),
        "stratz_completeness_pct": round(enriched / window_size * 100, 1) if window_size else 0,
        "quota": stratz_remaining(db),
    }


def _loop() -> None:
    adapter = StratzAdapter()
    logger.info("STRATZ enrichment worker started; tick=%s batch=%s", STRATZ_ENRICHMENT_TICK_SEC, STRATZ_ENRICHMENT_BATCH)
    while not _stop_event.is_set():
        try:
            _tick(adapter)
        except Exception as exc:  # noqa: BLE001
            logger.exception("STRATZ enrichment tick failed: %s", exc)
            with _lock:
                _state["errors"] += 1
                _state["last_error"] = str(exc)
        with _lock:
            _state["ticks"] += 1
            _state["last_tick"] = _now().isoformat()
        _stop_event.wait(STRATZ_ENRICHMENT_TICK_SEC)
    with _lock:
        _state["running"] = False


def _pick_batch(db: Session) -> list[StratzMatchEnrichment]:
    now = _now()
    return (
        db.query(StratzMatchEnrichment)
        .filter(
            StratzMatchEnrichment.state.notin_(TERMINAL_STATES),
            StratzMatchEnrichment.attempts < STRATZ_MAX_ATTEMPTS,
            (StratzMatchEnrichment.next_check_at.is_(None))
            | (StratzMatchEnrichment.next_check_at <= now),
        )
        .order_by(
            StratzMatchEnrichment.priority.asc(),
            StratzMatchEnrichment.attempts.asc(),
            StratzMatchEnrichment.next_check_at.asc().nullsfirst(),
        )
        .limit(STRATZ_ENRICHMENT_BATCH)
        .all()
    )


def _tick(adapter: StratzAdapter) -> None:
    if not adapter.enabled:
        return
    db = SessionLocal()
    try:
        rows = _pick_batch(db)
        for row in rows:
            if _stop_event.is_set():
                break
            _process_row(db, row, adapter)
            db.commit()
    finally:
        db.close()


def _process_row(db: Session, row: StratzMatchEnrichment, adapter: StratzAdapter) -> None:
    row.state = "running"
    row.attempts = (row.attempts or 0) + 1
    row.updated_at = _now()
    db.flush()
    dto = adapter.fetch_match(int(row.match_id))
    if dto is None:
        row.state = "failed" if row.attempts >= STRATZ_MAX_ATTEMPTS else "queued"
        row.last_error = "STRATZ returned no match data"
        row.next_check_at = None if row.state == "failed" else _now() + _backoff(row.attempts)
        return
    _upsert_detail(db, dto)
    row.state = "enriched"
    row.fetched_at = _now()
    row.next_check_at = None
    row.last_error = None
    _denormalize_player_match(db, row.account_id, dto)
    rebuild_player_match_analytics(db, int(row.account_id))
    with _lock:
        _state["matches_enriched_total"] += 1


def _upsert_detail(db: Session, dto: MatchDetailDTO) -> None:
    row = db.query(PlayerMatchDetail).filter(PlayerMatchDetail.match_id == dto.match_id).first()
    if row is None:
        row = PlayerMatchDetail(match_id=dto.match_id)
        db.add(row)
    if row.is_parsed and row.source != "stratz":
        # STRATZ is the preferred enriched source for this feature set, so it
        # may upgrade an OpenDota row. A later sparse source must not regress it.
        pass
    row.source = dto.source
    row.is_parsed = True
    row.parser_version = dto.parser_version
    row.start_time = dto.start_time
    row.duration = dto.duration
    row.game_mode = dto.game_mode
    row.lobby_type = dto.lobby_type
    row.radiant_win = dto.radiant_win
    row.avg_rank_tier = dto.avg_rank_tier
    row.raw_json = dto.raw
    row.fetched_at = _now()
    row.last_parse_check_at = _now()
    row.parse_state = "parsed"
    row.next_check_at = None


def _denormalize_player_match(db: Session, account_id: int, dto: MatchDetailDTO) -> None:
    pm = db.query(PlayerMatch).filter(
        PlayerMatch.account_id == int(account_id),
        PlayerMatch.match_id == int(dto.match_id),
    ).first()
    if not pm:
        return
    player = None
    for candidate in dto.players:
        try:
            if candidate.account_id is not None and int(candidate.account_id) == int(account_id):
                player = candidate
                break
        except Exception:
            pass
    if player is None:
        for candidate in dto.players:
            if candidate.hero_id == pm.hero_id and candidate.player_slot == pm.player_slot:
                player = candidate
                break
    if player is None:
        return
    pm.hero_id = player.hero_id or pm.hero_id
    pm.kills = player.kills
    pm.deaths = player.deaths
    pm.assists = player.assists
    pm.gold_per_min = player.gold_per_min
    pm.xp_per_min = player.xp_per_min
    pm.last_hits = player.last_hits
    pm.denies = player.denies
    pm.hero_damage = player.hero_damage
    pm.tower_damage = player.tower_damage
    pm.hero_healing = player.hero_healing
    pm.obs_placed = player.obs_placed
    pm.sen_placed = player.sen_placed
    pm.duration = dto.duration or pm.duration
    pm.player_slot = player.player_slot
    pm.radiant_win = dto.radiant_win
    pm.lane_role = player.lane_role or pm.lane_role
    pm.start_time = dto.start_time or pm.start_time
    pm.game_mode = dto.game_mode if dto.game_mode is not None else pm.game_mode
    pm.lobby_type = dto.lobby_type if dto.lobby_type is not None else pm.lobby_type
    pm.average_rank = dto.avg_rank_tier or pm.average_rank
    pm.is_detailed = True


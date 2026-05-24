"""Background drip-feed refresh of linked Steam accounts.

Replaces the old "once a day, schedule everyone at once" loop with a
quiet round-robin: every tick we pick **one** account whose data is the
oldest, and if it's gone past the staleness threshold we schedule its
deep-sync. Because schedule_deep_sync goes through a single-worker
queue, this naturally serialises the load on OpenDota — and because we
re-pick the oldest each tick, every linked account naturally cycles
through with roughly the same spacing.

There is no longer a "Update data" button in the UI; this loop is the
*only* path that refreshes a linked account in the steady state. Two
exceptions still exist and they're correct:

- ``DotaPrivacyBanner`` triggers ``/player/sync-steam`` when the user
  explicitly says "I just toggled Expose Public Match Data" — that
  needs an immediate retry, not a 12-hour wait.
- The Dashboard's auto-recovery sync triggers after a fresh link if
  the first analyse came back empty.

Tunables (env):

- ``AUTO_REFRESH_ENABLED`` — master switch (default true)
- ``AUTO_REFRESH_STALE_HOURS`` — how old fetched_at must be before we
  consider an account refresh-eligible (default 12). With drip-feed
  you can use a smaller value than the old "24h" full-pass setting,
  because we don't burst.
- ``AUTO_REFRESH_TICK_SEC`` — how often the loop wakes up. The default
  scales with population (see ``_compute_tick``) but you can pin it
  with this env var.
- ``AUTO_REFRESH_MIN_GAP_SEC`` — minimum delay between two refreshes
  even when many accounts are stale; protects the OpenDota rate budget
  from a startup burst (default 60s).
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import nullsfirst

from app.database import SessionLocal
from app.models import PlayerAccount
from app.player_sync_manager import schedule_deep_sync
from app.rate_budget import opendota_budget

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


STALE_HOURS = max(1, int(os.getenv("AUTO_REFRESH_STALE_HOURS", "12")))
MIN_GAP_SEC = max(15, int(os.getenv("AUTO_REFRESH_MIN_GAP_SEC", "60")))
TICK_OVERRIDE_SEC = int(os.getenv("AUTO_REFRESH_TICK_SEC", "0") or "0")
# Safety reserve: don't queue a sync when the OpenDota bucket is almost
# empty — interactive page loads should win.
RATE_RESERVE = max(5, int(os.getenv("AUTO_REFRESH_RATE_RESERVE", "15")))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pick_next_account(db) -> PlayerAccount | None:
    """The single oldest-fetched linked account that's past the TTL.

    ``NULLS FIRST`` because accounts with no fetched_at at all (just
    created, never auto-synced) should rotate in immediately.
    """
    cutoff = _now().timestamp() - STALE_HOURS * 3600
    candidates = (
        db.query(PlayerAccount)
        .order_by(nullsfirst(PlayerAccount.fetched_at.asc()))
        .limit(1)
        .all()
    )
    if not candidates:
        return None
    acc = candidates[0]
    fetched = acc.fetched_at
    if fetched is not None:
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        if fetched.timestamp() > cutoff:
            return None  # even the oldest one is fresh enough — nothing to do
    return acc


def _compute_tick(account_count: int) -> int:
    """Choose a sleep length so the population cycles through once per
    ``STALE_HOURS``. Bounded to keep tiny populations from spinning and
    huge populations from looking dead.
    """
    if TICK_OVERRIDE_SEC > 0:
        return TICK_OVERRIDE_SEC
    if account_count <= 1:
        # No real benefit to ticking faster than every 5 min when there's
        # nothing/almost-nothing to refresh.
        return 300
    spacing = (STALE_HOURS * 3600) // account_count
    return max(MIN_GAP_SEC, min(spacing, 1800))  # at most one refresh / 30 min


def _loop():
    logger.info(
        "auto_refresh started: stale_hours=%s, min_gap=%ss, rate_reserve=%s",
        STALE_HOURS, MIN_GAP_SEC, RATE_RESERVE,
    )
    while True:
        try:
            tick_sec = _drip_once()
        except Exception as exc:  # noqa: BLE001
            logger.warning("auto_refresh tick crashed: %s", exc)
            tick_sec = 60
        time.sleep(max(MIN_GAP_SEC, tick_sec))


def _drip_once() -> int:
    """One round of "find the oldest stale account, queue it, sleep
    according to population size". Returns the sleep length in seconds.
    """
    # Yield to interactive callers when the bucket is low — refresh can
    # always wait, a user loading a page cannot.
    if opendota_budget.available() < RATE_RESERVE:
        return MIN_GAP_SEC

    db = SessionLocal()
    try:
        total = db.query(PlayerAccount).count()
        if total == 0:
            return _compute_tick(0)

        acc = _pick_next_account(db)
        if acc is None:
            # Everyone's fresh — sleep a typical tick before checking again.
            return _compute_tick(total)

        try:
            schedule_deep_sync(int(acc.account_id), steam_id=acc.steam_id, force=False)
            logger.info(
                "auto_refresh: scheduled %s (fetched_at=%s, %s/%s accounts cycling)",
                acc.account_id, acc.fetched_at, 1, total,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("auto_refresh: schedule failed for %s: %s", acc.account_id, exc)
            return MIN_GAP_SEC
    finally:
        db.close()

    return _compute_tick(total)


def start():
    """Kick off the drip-feed thread. Safe to call multiple times."""
    if not _env_flag("AUTO_REFRESH_ENABLED", True):
        logger.info("auto_refresh disabled via AUTO_REFRESH_ENABLED=false")
        return
    if getattr(start, "_started", False):
        return
    start._started = True  # type: ignore[attr-defined]
    threading.Thread(target=_loop, daemon=True, name="auto-refresh").start()

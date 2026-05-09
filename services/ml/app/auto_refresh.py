"""Periodic background refresh of every linked Steam account.

Runs as a daemon thread started from ``main.startup``. Once a day it walks
every row of ``player_accounts`` whose ``fetched_at`` is older than the
configured TTL (default 24h), and schedules a deep-sync via
``player_sync_manager.schedule_deep_sync``. The sync manager itself has
its own single-worker queue, so we never hit OpenDota with more than one
in-flight deep-sync at a time. We also sleep between enqueues to stay
well under OpenDota's 60 requests / minute limit.

Tunables:
- ``AUTO_REFRESH_ENABLED`` (default true)
- ``AUTO_REFRESH_STALE_HOURS`` — how stale a row must be before we queue (24)
- ``AUTO_REFRESH_INTERVAL_SEC`` — sleep between full passes (24 * 3600)
- ``AUTO_REFRESH_ENQUEUE_DELAY_SEC`` — sleep between two enqueues (15)
- ``AUTO_REFRESH_FORCE_ON_START`` — enqueue all accounts once after deploy (true)
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import PlayerAccount
from app.player_sync_manager import schedule_deep_sync

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


STALE_HOURS = max(1, int(os.getenv("AUTO_REFRESH_STALE_HOURS", "24")))
INTERVAL_SEC = max(3600, int(os.getenv("AUTO_REFRESH_INTERVAL_SEC", str(24 * 3600))))
ENQUEUE_DELAY_SEC = max(5, int(os.getenv("AUTO_REFRESH_ENQUEUE_DELAY_SEC", "15")))
FORCE_ON_START = _env_flag("AUTO_REFRESH_FORCE_ON_START", True)


def _run_once(force: bool = False) -> int:
    """Enqueue deep-sync for every account that's older than STALE_HOURS.

    Returns the number of accounts scheduled this pass.
    """
    cutoff = datetime.now(timezone.utc).timestamp() - STALE_HOURS * 3600
    db = SessionLocal()
    try:
        accounts = db.query(PlayerAccount).all()
    finally:
        db.close()

    scheduled = 0
    for acc in accounts:
        fetched = acc.fetched_at
        if fetched is not None and not force:
            if fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            if fetched.timestamp() > cutoff:
                # Recent enough — skip.
                continue
        try:
            schedule_deep_sync(acc.account_id, steam_id=acc.steam_id, force=False)
            scheduled += 1
        except Exception as exc:
            logger.warning("auto_refresh: schedule failed for %s: %s", acc.account_id, exc)
        # Be gentle: even though schedule_deep_sync is just a queue push, the
        # worker it triggers will hit OpenDota. Spacing enqueues out smooths
        # the load on the worker's first minutes.
        time.sleep(ENQUEUE_DELAY_SEC)
    return scheduled


def _loop():
    logger.info(
        "auto_refresh loop started: stale_hours=%s, interval_sec=%s, enqueue_delay=%s, force_on_start=%s",
        STALE_HOURS, INTERVAL_SEC, ENQUEUE_DELAY_SEC, FORCE_ON_START,
    )
    first_pass = True
    while True:
        try:
            force = first_pass and FORCE_ON_START
            first_pass = False
            n = _run_once(force=force)
            logger.info("auto_refresh: scheduled deep-sync for %s accounts", n)
        except Exception as exc:
            logger.warning("auto_refresh pass crashed: %s", exc)
        time.sleep(INTERVAL_SEC)


def start():
    """Kick off the background thread. Safe to call multiple times."""
    if not _env_flag("AUTO_REFRESH_ENABLED", True):
        logger.info("auto_refresh disabled via AUTO_REFRESH_ENABLED=false")
        return
    if getattr(start, "_started", False):
        return
    start._started = True  # type: ignore[attr-defined]
    threading.Thread(target=_loop, daemon=True, name="auto-refresh").start()

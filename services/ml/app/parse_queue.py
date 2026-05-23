"""Per-match parse queue helpers.

The queue itself lives in ``player_match_details`` (columns ``priority``,
``parse_state``, ``next_check_at``). These helpers are the only place
that knows the conventions (priority numbers, backoff schedule, terminal
states) — call sites just say "I want this match parsed at this tier"
or "upgrade this match to hot" without dealing with timestamps.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import case, func, text
from sqlalchemy.orm import Session

from app.match_clusters import (
    CLUSTER_RANKED, PUBLIC_RANKED_LOBBIES, TURBO_GAME_MODE,
)
from app.models import PlayerMatch, PlayerMatchDetail

logger = logging.getLogger(__name__)

# Priority tiers — lower = sooner. See product spec discussion.
PRIORITY_HOT = 1     # user is looking at this match (or top of dashboard)
PRIORITY_WARM = 2    # top 30 recent matches of an active user
PRIORITY_COLD = 3    # the rest of the analysis window (matches 31..200)

# How many "recent" matches we treat as warm. Cold = the rest.
WARM_HEAD_COUNT = 30
# How many matches per player we ever try to auto-parse. Older matches
# are only parsed on-demand when a user opens them.
ANALYSIS_WINDOW = 200

# Backoff schedule (minutes) for re-checking whether OpenDota finished
# parsing. After we exhaust this we mark the match `unavailable`.
_HOT_BACKOFF = [1, 1, 2, 2, 5, 5, 10, 10]
_WARM_BACKOFF = [1, 2, 5, 10, 30, 60, 120]
_COLD_BACKOFF = [5, 15, 30, 60, 120, 240]
MAX_ATTEMPTS = 8

# Terminal states (worker never picks these back up).
TERMINAL_STATES = ("parsed", "unavailable")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _backoff(priority: int, attempts: int) -> timedelta:
    table = _HOT_BACKOFF if priority == PRIORITY_HOT else (
        _WARM_BACKOFF if priority == PRIORITY_WARM else _COLD_BACKOFF
    )
    idx = min(attempts, len(table) - 1)
    return timedelta(minutes=table[idx])


# ---------- enqueue ----------

def enqueue(
    db: Session,
    match_id: int,
    *,
    priority: int = PRIORITY_COLD,
    when: Optional[datetime] = None,
) -> None:
    """Insert or upgrade a single match into the parse queue.

    Never downgrades priority — if a row already has a higher (lower
    number) tier we keep it. Already-parsed rows are no-ops.
    """
    row = db.query(PlayerMatchDetail).filter(
        PlayerMatchDetail.match_id == match_id
    ).first()
    when_ts = when or _now()

    if row is None:
        row = PlayerMatchDetail(
            match_id=match_id,
            source="opendota",  # placeholder; updated when we actually fetch
            is_parsed=False,
            parse_state="queued",
            priority=priority,
            next_check_at=when_ts,
        )
        db.add(row)
        return

    if row.parse_state == "parsed":
        return

    if priority < (row.priority or 99):
        row.priority = priority
    if not row.next_check_at or row.next_check_at > when_ts:
        row.next_check_at = when_ts
    if row.parse_state == "unavailable":
        # Hot upgrade gives unavailable rows one more chance — useful if
        # OpenDota has freshly pulled the replay since we gave up.
        if priority == PRIORITY_HOT:
            row.parse_state = "queued"
            row.parse_attempts = 0


def enqueue_for_account(
    db: Session,
    account_id: int,
    *,
    head_warm: int = WARM_HEAD_COUNT,
    window: int = ANALYSIS_WINDOW,
) -> dict:
    """Enqueue analysis window for a freshly synced account.

    Strategy:
      1. Pull up to ``window`` most recent matches.
      2. Warm tier = first ``head_warm`` *ranked* matches (the ones that
         actually drive feature analysis). If the player has fewer than
         ``head_warm`` ranked, top up the warm tier with the most recent
         turbo/unranked matches so the user still gets *some* fast
         parsed data — important for fresh accounts that mostly play
         turbo.
      3. Cold tier = the rest of the window (mixed modes), parsed in
         background.

    Returns counts split by tier and a breakdown of how the warm tier
    was filled — surfaced in logs so we can verify the priority logic
    is actually doing what we want.
    """
    rows = (
        db.query(
            PlayerMatch.match_id,
            PlayerMatch.start_time,
            PlayerMatch.lobby_type,
            PlayerMatch.game_mode,
        )
        .filter(PlayerMatch.account_id == account_id)
        .order_by(PlayerMatch.start_time.desc().nullslast())
        .limit(window)
        .all()
    )
    if not rows:
        return {"warm": 0, "cold": 0, "warm_ranked": 0, "warm_fallback": 0}

    def _is_ranked(lt, gm) -> bool:
        return (lt in PUBLIC_RANKED_LOBBIES) and (gm != TURBO_GAME_MODE)

    ranked_ids: list[int] = []
    other_ids: list[int] = []
    for match_id, _ts, lt, gm in rows:
        if not match_id:
            continue
        mid = int(match_id)
        if _is_ranked(lt, gm):
            ranked_ids.append(mid)
        else:
            other_ids.append(mid)

    warm_ranked_ids = ranked_ids[:head_warm]
    warm_fallback_ids: list[int] = []
    remaining_ranked_ids = ranked_ids[head_warm:]
    if len(warm_ranked_ids) < head_warm:
        # Top up the warm tier with the freshest "other" matches so the
        # user gets parsed data fast even when they barely play ranked.
        need = head_warm - len(warm_ranked_ids)
        warm_fallback_ids = other_ids[:need]
        cold_ids = remaining_ranked_ids + other_ids[need:]
    else:
        cold_ids = remaining_ranked_ids + other_ids

    now = _now()
    for mid in warm_ranked_ids + warm_fallback_ids:
        enqueue(db, mid, priority=PRIORITY_WARM, when=now)
    for mid in cold_ids:
        enqueue(db, mid, priority=PRIORITY_COLD, when=now)
    db.flush()

    stats = {
        "warm": len(warm_ranked_ids) + len(warm_fallback_ids),
        "warm_ranked": len(warm_ranked_ids),
        "warm_fallback": len(warm_fallback_ids),
        "cold": len(cold_ids),
    }
    logger.info(
        "Enqueued for account %s: warm=%s (ranked=%s, fallback=%s), cold=%s",
        account_id, stats["warm"], stats["warm_ranked"],
        stats["warm_fallback"], stats["cold"],
    )
    return stats


def upgrade_to_hot(db: Session, match_id: int) -> None:
    """User just opened this match — push it to the front of the queue."""
    enqueue(db, match_id, priority=PRIORITY_HOT, when=_now())


# ---------- worker step ----------

def pick_batch(db: Session, limit: int) -> list[PlayerMatchDetail]:
    """Take the next ``limit`` rows the worker should touch right now."""
    now = _now()
    rows = (
        db.query(PlayerMatchDetail)
        .filter(
            PlayerMatchDetail.parse_state.notin_(TERMINAL_STATES),
            PlayerMatchDetail.parse_attempts < MAX_ATTEMPTS,
            (PlayerMatchDetail.next_check_at.is_(None))
            | (PlayerMatchDetail.next_check_at <= now),
        )
        .order_by(
            PlayerMatchDetail.priority.asc(),
            PlayerMatchDetail.parse_attempts.asc(),
            PlayerMatchDetail.last_parse_check_at.asc().nullsfirst(),
        )
        .limit(limit)
        .all()
    )
    return rows


def reschedule(
    row: PlayerMatchDetail,
    *,
    state: str,
    saw_attempt: bool = True,
) -> None:
    """Mutate ``row`` in place after one worker iteration.

    ``state`` ∈ {'requested', 'queued', 'parsed', 'unavailable'}.
    For non-terminal states we bump attempts and schedule the next
    check using the priority-aware backoff.
    """
    row.parse_state = state
    row.last_parse_check_at = _now()
    if state in TERMINAL_STATES:
        row.next_check_at = None
        return

    if saw_attempt:
        row.parse_attempts = (row.parse_attempts or 0) + 1

    if row.parse_attempts >= MAX_ATTEMPTS:
        row.parse_state = "unavailable"
        row.next_check_at = None
        return

    row.next_check_at = _now() + _backoff(row.priority or PRIORITY_COLD, row.parse_attempts)


# ---------- progress queries ----------

def progress_for_account(db: Session, account_id: int, window: int = ANALYSIS_WINDOW) -> dict:
    """Aggregated parse progress for the dashboard badge.

    Uses the same window we enqueue (``ANALYSIS_WINDOW``) so the badge
    matches what the worker is actually trying to parse.
    """
    match_ids_q = (
        db.query(PlayerMatch.match_id)
        .filter(PlayerMatch.account_id == account_id)
        .order_by(PlayerMatch.start_time.desc().nullslast())
        .limit(window)
        .subquery()
    )

    counts_q = (
        db.query(
            func.count().label("total"),
            func.sum(case((PlayerMatchDetail.parse_state == "parsed", 1), else_=0)).label("parsed"),
            func.sum(case((PlayerMatchDetail.parse_state == "queued", 1), else_=0)).label("queued"),
            func.sum(case((PlayerMatchDetail.parse_state == "requested", 1), else_=0)).label("requested"),
            func.sum(case((PlayerMatchDetail.parse_state == "unavailable", 1), else_=0)).label("unavailable"),
        )
        .filter(PlayerMatchDetail.match_id.in_(match_ids_q))
        .one()
    )

    total_matches_loaded = db.query(func.count(PlayerMatch.id)).filter(
        PlayerMatch.account_id == account_id
    ).scalar() or 0
    window_size = min(total_matches_loaded, window)
    in_queue = int(counts_q.queued or 0) + int(counts_q.requested or 0)
    parsed = int(counts_q.parsed or 0)
    unavailable = int(counts_q.unavailable or 0)
    not_enqueued = max(window_size - int(counts_q.total or 0), 0)

    return {
        "window": window_size,
        "matches_loaded": total_matches_loaded,
        "parsed": parsed,
        "in_progress": in_queue,
        "not_enqueued": not_enqueued,
        "unavailable": unavailable,
        "completeness_pct": round(parsed / window_size * 100, 1) if window_size else 0,
    }


def is_match_in_account(db: Session, account_id: int, match_id: int) -> bool:
    return db.execute(
        text("SELECT 1 FROM player_matches WHERE account_id = :a AND match_id = :m LIMIT 1"),
        {"a": account_id, "m": match_id},
    ).first() is not None

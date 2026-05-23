"""Orchestrator that gives prikladnoy code one entrypoint for "give me
this match in maximum detail you currently have".

Logic per request:

1. Cache lookup in ``player_match_details``.
   * If we have a parsed copy younger than ``DETAIL_FRESH_SEC`` — return it.
   * If we have an unparsed copy — fall through, try to upgrade.

2. Ask each source adapter in order (currently just OpenDota; Stratz
   slots in here trivially):
   * If the source returns a parsed DTO — cache and return.
   * If it returns an unparsed DTO — cache it, request parse, return.
   * If it returns None — try next source.

3. The "view" derivations (lane phase summary, item timings, teamfights)
   are computed on the way out so the frontend always gets a uniform
   ``MatchDetailView`` shape regardless of which source filled the cache.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import PlayerMatchDetail
from app.parse_queue import upgrade_to_hot
from app.rate_budget import opendota_budget
from app.sources import MatchDetailDTO, OpenDotaAdapter, SourceAdapter

logger = logging.getLogger(__name__)

# How long a parsed match counts as "fresh enough" — parsed matches are
# immutable after replay processing, so we essentially never refetch them.
PARSED_TTL = timedelta(days=365)
# Unparsed matches we recheck every ~5 minutes when someone asks for them;
# the first 30 min after match end is when OpenDota usually upgrades them.
UNPARSED_TTL = timedelta(minutes=5)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MatchDetailService:
    """Returns ``MatchDetailDTO`` for a given match_id using a stack of
    source adapters with persistent caching."""

    def __init__(self, adapters: Optional[list[SourceAdapter]] = None):
        # Order matters — first to return parsed data wins. Stratz, when
        # configured, should go in front of OpenDota.
        self.adapters: list[SourceAdapter] = adapters or [OpenDotaAdapter()]

    # ---------- public API ----------

    def get(
        self,
        db: Session,
        match_id: int,
        *,
        force_refresh: bool = False,
    ) -> Optional[MatchDetailDTO]:
        cached = db.query(PlayerMatchDetail).filter(
            PlayerMatchDetail.match_id == match_id
        ).first()

        if cached and not force_refresh and not self._is_stale(cached):
            # User is looking at this match — bump its priority so the
            # worker rechecks it sooner than the cold-tier schedule.
            if not cached.is_parsed:
                upgrade_to_hot(db, match_id)
                db.commit()
            return self._from_row(cached)

        # Interactive paths must respect the same token bucket the parse
        # worker uses, otherwise a page load can spike past the rate
        # limit and earn the whole app a 429.
        if not opendota_budget.take(timeout=8.0):
            # Cannot afford a live fetch right now — fall back to whatever
            # we have cached (even if stale) and let the worker catch up.
            if cached:
                if not cached.is_parsed:
                    upgrade_to_hot(db, match_id)
                    db.commit()
                return self._from_row(cached)
            return None

        # Try sources in priority order; first to give us parsed wins.
        best_dto: Optional[MatchDetailDTO] = self._from_row(cached) if cached else None

        for adapter in self.adapters:
            try:
                dto = adapter.fetch_match(match_id)
            except Exception as exc:  # noqa: BLE001 — never let one source break others
                logger.warning("Adapter %s threw on match %s: %s", adapter.name, match_id, exc)
                continue
            if dto is None:
                continue
            best_dto = dto
            if dto.is_parsed:
                break  # nothing better to ask for

        if best_dto is None:
            return None

        self._upsert(db, best_dto, requested_parse=False)

        # If we still don't have parsed data, escalate via the queue
        # (hot tier — the user is actively waiting) and let the worker
        # do the request_parse/recheck dance on its own schedule.
        if not best_dto.is_parsed:
            upgrade_to_hot(db, match_id)

        db.commit()
        return best_dto

    def list_pending_parse(self, db: Session, limit: int = 50) -> list[int]:
        """Match ids that we know aren't parsed yet — used by background
        worker to recheck them periodically."""
        rows = (
            db.query(PlayerMatchDetail.match_id)
            .filter(PlayerMatchDetail.is_parsed.is_(False))
            .order_by(PlayerMatchDetail.last_parse_check_at.asc().nullsfirst())
            .limit(limit)
            .all()
        )
        return [r[0] for r in rows]

    # ---------- internals ----------

    def _is_stale(self, row: PlayerMatchDetail) -> bool:
        if not row.fetched_at:
            return True
        fetched = row.fetched_at
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        ttl = PARSED_TTL if row.is_parsed else UNPARSED_TTL
        return (_now() - fetched) > ttl

    def _maybe_request_parse(
        self,
        db: Session,
        match_id: int,
        cached: Optional[PlayerMatchDetail],
    ) -> None:
        attempts = (cached.parse_attempts if cached else 0) or 0
        # Cap retries — after ~6 tries (≈30-60 min) OpenDota is unlikely to
        # ever parse it (probably an unrecorded replay).
        if attempts >= 6:
            return

        for adapter in self.adapters:
            try:
                ok = adapter.request_parse(match_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Parse request via %s failed for %s: %s", adapter.name, match_id, exc)
                continue
            if ok:
                row = db.query(PlayerMatchDetail).filter(
                    PlayerMatchDetail.match_id == match_id
                ).first()
                if row is not None:
                    row.parse_attempts = attempts + 1
                    row.parse_requested_at = _now()
                    row.last_parse_check_at = _now()
                return

    def _upsert(self, db: Session, dto: MatchDetailDTO, requested_parse: bool) -> None:
        row = db.query(PlayerMatchDetail).filter(
            PlayerMatchDetail.match_id == dto.match_id
        ).first()
        if row is None:
            row = PlayerMatchDetail(match_id=dto.match_id)
            db.add(row)

        # Do not regress is_parsed once we have it. If a degraded source
        # later replies with unparsed data we keep the richer copy.
        becomes_parsed = bool(dto.is_parsed)
        if row.is_parsed and not becomes_parsed:
            return

        row.source = dto.source
        row.is_parsed = becomes_parsed
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
        # Mirror the parse_state so the worker picks the row only when
        # there's something for it to do. We never regress to 'queued'
        # because a row in 'requested' state may have a pending parse
        # we don't want to re-request.
        if becomes_parsed:
            row.parse_state = "parsed"
            row.next_check_at = None
        if requested_parse:
            row.parse_requested_at = _now()
            row.parse_attempts = (row.parse_attempts or 0) + 1

    def _from_row(self, row: PlayerMatchDetail) -> Optional[MatchDetailDTO]:
        if row is None or not row.raw_json:
            return None
        # Re-run the adapter that produced the row against its raw payload.
        # This keeps a single normalization path: source → adapter → DTO,
        # even when the source is "our DB".
        adapter = next((a for a in self.adapters if a.name == row.source), None)
        if adapter is None:
            return None
        # Adapters expose ``_player_dto``-style helpers via fetch_match; we
        # construct a DTO directly from raw_json by re-using OpenDota
        # internals where possible. For now only opendota is cached.
        if row.source == "opendota":
            from app.sources.opendota import _player_dto, _avg_rank
            raw = row.raw_json
            players_raw = raw.get("players") or []
            return MatchDetailDTO(
                match_id=row.match_id,
                source=row.source,
                is_parsed=bool(row.is_parsed),
                parser_version=row.parser_version,
                start_time=row.start_time,
                duration=row.duration,
                game_mode=row.game_mode,
                lobby_type=row.lobby_type,
                radiant_win=row.radiant_win,
                radiant_score=raw.get("radiant_score"),
                dire_score=raw.get("dire_score"),
                avg_rank_tier=row.avg_rank_tier or _avg_rank(players_raw),
                first_blood_time=raw.get("first_blood_time"),
                players=[_player_dto(p) for p in players_raw if p.get("hero_id")],
                raw=raw,
            )
        return None


# ---------- view derivations ----------

def _kda(p) -> float:
    deaths = p.deaths or 0
    return round((p.kills + p.assists) / max(deaths, 1), 2)


def _lane_summary(p) -> dict:
    """Returns CS / GPM / XPM at minute 10, plus a delta vs the player on
    the opposite team in the same lane. Falls back to nulls when timeseries
    are not in the parsed payload yet."""
    gold_t = p.gold_t or []
    xp_t = p.xp_t or []
    lh_t = p.lh_t or []

    def at(arr, idx):
        return arr[idx] if len(arr) > idx else None

    return {
        "gold_at_10": at(gold_t, 10),
        "xp_at_10": at(xp_t, 10),
        "lh_at_10": at(lh_t, 10),
        "gold_at_20": at(gold_t, 20),
        "xp_at_20": at(xp_t, 20),
        "lh_at_20": at(lh_t, 20),
        "available": bool(gold_t),
    }


def _item_timings(p) -> list[dict]:
    """First time each item id was bought, oldest first. Empty when match
    isn't parsed yet."""
    log = p.purchase_log or []
    seen: dict[str, int] = {}
    for entry in log:
        name = entry.get("key") or entry.get("name")
        t = entry.get("time")
        if name is None or t is None:
            continue
        if name not in seen:
            seen[name] = int(t)
    out = [{"item": name, "time": t} for name, t in seen.items()]
    out.sort(key=lambda x: x["time"])
    return out


def to_view(dto: MatchDetailDTO, focus_account_id: Optional[int] = None) -> dict:
    """Serialize a DTO into the JSON shape the frontend expects.

    ``focus_account_id`` highlights one player (the user looking at the
    page) — derived blocks like lane phase / item timings are returned
    only for that slot to keep the payload small.
    """
    focus = None
    if focus_account_id:
        for p in dto.players:
            if p.account_id == focus_account_id:
                focus = p
                break

    return {
        "match_id": dto.match_id,
        "source": dto.source,
        "is_parsed": dto.is_parsed,
        "parser_version": dto.parser_version,
        "start_time": dto.start_time,
        "duration": dto.duration,
        "game_mode": dto.game_mode,
        "lobby_type": dto.lobby_type,
        "radiant_win": dto.radiant_win,
        "radiant_score": dto.radiant_score,
        "dire_score": dto.dire_score,
        "avg_rank_tier": dto.avg_rank_tier,
        "first_blood_time": dto.first_blood_time,
        "players": [
            {
                **{k: v for k, v in asdict(p).items()
                   if k not in ("gold_t", "xp_t", "lh_t", "purchase_log", "ability_upgrades")},
                "kda": _kda(p),
                "won": (p.is_radiant == bool(dto.radiant_win)) if dto.radiant_win is not None else None,
            }
            for p in dto.players
        ],
        "focus": (
            {
                "account_id": focus.account_id,
                "hero_id": focus.hero_id,
                "lane_phase": _lane_summary(focus),
                "item_timings": _item_timings(focus),
                "ability_upgrades": focus.ability_upgrades or [],
                "obs_placed": focus.obs_placed,
                "sen_placed": focus.sen_placed,
                "teamfight_participation": focus.teamfight_participation,
                "actions_per_min": focus.actions_per_min,
            }
            if focus
            else None
        ),
    }


# Singleton — adapters are stateless so this is safe.
match_detail_service = MatchDetailService()

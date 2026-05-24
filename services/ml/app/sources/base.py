"""Unified DTO + base adapter contract for match-detail sources.

The DTO is intentionally lean — only fields the frontend actually renders
in ``MatchDetail.tsx``. Anything richer (full purchase log, ability casts,
ward coordinates) stays in ``raw_json`` on ``PlayerMatchDetail`` and is
unpacked on demand by source-specific helpers, so prikladnoy code never
has to switch on ``source``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


class SourceUnavailable(Exception):
    """The adapter could not return any data for this match.

    Distinct from a parse-pending response — ``SourceUnavailable`` means
    the orchestrator should fall back to the next adapter. A parse-pending
    response is encoded as ``MatchDetailDTO(is_parsed=False, ...)``.
    """


@dataclass
class PlayerDetailDTO:
    """One slot in a match (per-player stats)."""

    account_id: Optional[int]
    player_slot: int
    hero_id: int
    is_radiant: bool
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    gold_per_min: Optional[int] = None
    xp_per_min: Optional[int] = None
    last_hits: Optional[int] = None
    denies: Optional[int] = None
    hero_damage: Optional[int] = None
    tower_damage: Optional[int] = None
    hero_healing: Optional[int] = None
    net_worth: Optional[int] = None
    level: Optional[int] = None
    lane: Optional[int] = None
    lane_role: Optional[int] = None
    is_roaming: Optional[bool] = None
    obs_placed: Optional[int] = None
    sen_placed: Optional[int] = None
    teamfight_participation: Optional[float] = None
    actions_per_min: Optional[int] = None
    rank_tier: Optional[int] = None
    # parsed-only fields
    gold_t: Optional[list] = None  # gold per minute curve
    xp_t: Optional[list] = None
    lh_t: Optional[list] = None
    purchase_log: Optional[list] = None  # [{time, item_name}]
    ability_upgrades: Optional[list] = None  # build order
    items: list = field(default_factory=list)  # final 6 item ids


@dataclass
class MatchDetailDTO:
    """Unified view of one match across all sources."""

    match_id: int
    source: str  # 'opendota' | 'stratz' | 'self_parsed'
    is_parsed: bool  # True if purchase_log/gold_t etc. are present
    parser_version: Optional[int] = None
    start_time: Optional[int] = None
    duration: Optional[int] = None
    game_mode: Optional[int] = None
    lobby_type: Optional[int] = None
    radiant_win: Optional[bool] = None
    radiant_score: Optional[int] = None
    dire_score: Optional[int] = None
    avg_rank_tier: Optional[int] = None
    first_blood_time: Optional[int] = None
    players: list[PlayerDetailDTO] = field(default_factory=list)
    raw: dict = field(default_factory=dict)  # full source payload (kept for JSONB cache)


class SourceAdapter:
    """Interface that every source must implement."""

    name: str = "base"

    def fetch_match(self, match_id: int) -> Optional[MatchDetailDTO]:
        """Return the match as a DTO, or ``None`` if not available now.

        ``None`` means "this source has nothing for this id, try next".
        A DTO with ``is_parsed=False`` means "we got base fields but parse
        is still pending in their pipeline".
        """
        raise NotImplementedError

    def request_parse(self, match_id: int) -> bool:
        """Ask the upstream to parse this match. Return ``True`` if accepted.

        Adapters that don't have a parse queue (Stratz returns parsed data
        on demand, self_parsed parses synchronously) should return ``True``
        unconditionally.
        """
        raise NotImplementedError

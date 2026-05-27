"""STRATZ source adapter.

Normalizes STRATZ GraphQL match payloads into the same DTO shape used by
OpenDota so downstream code does not need source-specific branches.
"""

from __future__ import annotations

from typing import Any, Optional

from app.stratz_client import StratzClient, STRATZ_ENABLED

from .base import MatchDetailDTO, PlayerDetailDTO, SourceAdapter


def _pick(row: dict[str, Any], *keys: str, default=None):
    for key in keys:
        if key in row and row.get(key) is not None:
            return row.get(key)
    return default


def _int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def _int_or_none(value):
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def _float(value):
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _slot(row: dict[str, Any]) -> int:
    raw = _pick(row, "playerSlot", "player_slot", "slot", default=0)
    return _int(raw)


def _items(row: dict[str, Any]) -> list[int]:
    return [
        _int(_pick(row, f"item{i}Id", f"item_{i}", f"item{i}", default=0))
        for i in range(6)
    ]


def _purchase_log(row: dict[str, Any]) -> Optional[list[dict[str, Any]]]:
    events = _pick(row, "purchaseEvents", "purchase_log")
    if not isinstance(events, list):
        return None
    out = []
    for item in events:
        if not isinstance(item, dict):
            continue
        out.append({
            "time": _pick(item, "time", "gameTime"),
            "item_id": _pick(item, "itemId", "item_id"),
        })
    return out


def _ability_log(row: dict[str, Any]) -> Optional[list[dict[str, Any]]]:
    events = _pick(row, "abilityLearnEvents", "ability_upgrades", "ability_upgrades_arr")
    if not isinstance(events, list):
        return None
    out = []
    for item in events:
        if not isinstance(item, dict):
            continue
        out.append({
            "time": _pick(item, "time", "gameTime"),
            "ability_id": _pick(item, "abilityId", "ability_id"),
            "level": _pick(item, "level"),
        })
    return out


def _role(row: dict[str, Any]) -> Optional[int]:
    raw = _pick(row, "laneRole", "lane_role", "position")
    try:
        val = int(raw)
        return val if 1 <= val <= 5 else None
    except Exception:
        return None


def _player_dto(row: dict[str, Any]) -> PlayerDetailDTO:
    slot = _slot(row)
    return PlayerDetailDTO(
        account_id=_pick(row, "steamAccountId", "account_id", "steam_account_id"),
        player_slot=slot,
        hero_id=_int(_pick(row, "heroId", "hero_id")),
        is_radiant=slot < 128,
        kills=_int(_pick(row, "kills")),
        deaths=_int(_pick(row, "deaths")),
        assists=_int(_pick(row, "assists")),
        gold_per_min=_pick(row, "goldPerMinute", "gold_per_min"),
        xp_per_min=_pick(row, "experiencePerMinute", "xp_per_min"),
        last_hits=_pick(row, "numLastHits", "last_hits"),
        denies=_pick(row, "numDenies", "denies"),
        hero_damage=_pick(row, "heroDamage", "hero_damage"),
        tower_damage=_pick(row, "towerDamage", "tower_damage"),
        hero_healing=_pick(row, "heroHealing", "hero_healing"),
        net_worth=_pick(row, "networth", "net_worth"),
        level=_pick(row, "level"),
        lane=_pick(row, "lane"),
        lane_role=_role(row),
        is_roaming=_pick(row, "isRoaming", "is_roaming"),
        obs_placed=_pick(row, "observerWardsPlaced", "obs_placed"),
        sen_placed=_pick(row, "sentryWardsPlaced", "sen_placed"),
        teamfight_participation=_float(_pick(row, "teamfightParticipation", "teamfight_participation")),
        actions_per_min=_pick(row, "actionsPerMinute", "actions_per_min"),
        rank_tier=_pick(row, "rankTier", "rank_tier"),
        gold_t=_pick(row, "goldPerMinuteTime", "gold_t"),
        xp_t=_pick(row, "experiencePerMinuteTime", "xp_t"),
        lh_t=_pick(row, "lastHitsPerMinuteTime", "lh_t"),
        purchase_log=_purchase_log(row),
        ability_upgrades=_ability_log(row),
        items=_items(row),
    )


class StratzAdapter(SourceAdapter):
    name = "stratz"

    def __init__(self, client: StratzClient | None = None):
        self.client = client or StratzClient()

    @property
    def enabled(self) -> bool:
        return bool(STRATZ_ENABLED and self.client.enabled)

    def fetch_match(self, match_id: int) -> Optional[MatchDetailDTO]:
        if not self.enabled:
            return None
        raw = self.client.fetch_match(match_id)
        if not raw:
            return None
        players_raw = raw.get("players") or []
        return MatchDetailDTO(
            match_id=_int(_pick(raw, "id"), int(match_id)),
            source=self.name,
            is_parsed=True,
            parser_version=None,
            start_time=_pick(raw, "startDateTime", "start_time"),
            duration=_pick(raw, "durationSeconds", "duration"),
            game_mode=_int_or_none(_pick(raw, "gameMode", "game_mode")),
            lobby_type=_int_or_none(_pick(raw, "lobbyType", "lobby_type")),
            radiant_win=_pick(raw, "didRadiantWin", "radiant_win"),
            radiant_score=_pick(raw, "radiantScore", "radiant_score"),
            dire_score=_pick(raw, "direScore", "dire_score"),
            avg_rank_tier=_pick(raw, "averageRank", "avg_rank_tier"),
            first_blood_time=_pick(raw, "firstBloodTime", "first_blood_time"),
            players=[_player_dto(p) for p in players_raw if isinstance(p, dict) and _pick(p, "heroId", "hero_id")],
            raw=raw,
        )

    def request_parse(self, match_id: int) -> bool:
        # STRATZ returns detailed data directly; there is no async parse queue
        # to request from our side.
        return self.enabled


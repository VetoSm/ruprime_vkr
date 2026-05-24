"""OpenDota source adapter.

Wraps the existing ``opendota_client`` helpers and translates their REST
shape into ``MatchDetailDTO``. Detection of "parsed vs not parsed" relies
on OpenDota convention: the ``version`` field is populated only after
their replay parser has processed the match.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from app.opendota_client import OPENDOTA_BASE, _append_api_key, fetch_match_details

from .base import MatchDetailDTO, PlayerDetailDTO, SourceAdapter

logger = logging.getLogger(__name__)


def _item_ids(p: dict) -> list[int]:
    out: list[int] = []
    for slot in range(6):
        v = p.get(f"item_{slot}")
        out.append(int(v) if v is not None else 0)
    return out


def _player_dto(p: dict) -> PlayerDetailDTO:
    slot = int(p.get("player_slot") or 0)
    return PlayerDetailDTO(
        account_id=p.get("account_id"),
        player_slot=slot,
        hero_id=int(p.get("hero_id") or 0),
        is_radiant=slot < 128,
        kills=int(p.get("kills") or 0),
        deaths=int(p.get("deaths") or 0),
        assists=int(p.get("assists") or 0),
        gold_per_min=p.get("gold_per_min"),
        xp_per_min=p.get("xp_per_min"),
        last_hits=p.get("last_hits"),
        denies=p.get("denies"),
        hero_damage=p.get("hero_damage"),
        tower_damage=p.get("tower_damage"),
        hero_healing=p.get("hero_healing"),
        net_worth=p.get("net_worth") or p.get("total_gold"),
        level=p.get("level"),
        lane=p.get("lane"),
        lane_role=p.get("lane_role"),
        is_roaming=p.get("is_roaming"),
        obs_placed=p.get("obs_placed"),
        sen_placed=p.get("sen_placed"),
        teamfight_participation=p.get("teamfight_participation"),
        actions_per_min=p.get("actions_per_min"),
        rank_tier=p.get("rank_tier"),
        gold_t=p.get("gold_t"),
        xp_t=p.get("xp_t"),
        lh_t=p.get("lh_t"),
        purchase_log=p.get("purchase_log"),
        ability_upgrades=p.get("ability_upgrades_arr"),
        items=_item_ids(p),
    )


def _avg_rank(players: list[dict]) -> Optional[int]:
    ranks = [int(p["rank_tier"]) for p in players if p.get("rank_tier")]
    if not ranks:
        return None
    return int(sum(ranks) / len(ranks))


class OpenDotaAdapter(SourceAdapter):
    name = "opendota"

    def fetch_match(self, match_id: int) -> Optional[MatchDetailDTO]:
        data = fetch_match_details(match_id)
        if not data:
            return None

        players_raw = data.get("players") or []
        is_parsed = bool(data.get("version"))
        return MatchDetailDTO(
            match_id=match_id,
            source=self.name,
            is_parsed=is_parsed,
            parser_version=data.get("version"),
            start_time=data.get("start_time"),
            duration=data.get("duration"),
            game_mode=data.get("game_mode"),
            lobby_type=data.get("lobby_type"),
            radiant_win=data.get("radiant_win"),
            radiant_score=data.get("radiant_score"),
            dire_score=data.get("dire_score"),
            avg_rank_tier=_avg_rank(players_raw),
            first_blood_time=data.get("first_blood_time"),
            players=[_player_dto(p) for p in players_raw if p.get("hero_id")],
            raw=data,
        )

    def request_parse(self, match_id: int) -> bool:
        """POST /request/{match_id} — добавляет матч в очередь парсинга."""
        url = f"{OPENDOTA_BASE}{_append_api_key(f'/request/{match_id}')}"
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.post(url)
            if resp.status_code in (200, 201):
                logger.info("OpenDota accepted parse request for %s", match_id)
                return True
            logger.warning(
                "OpenDota parse request %s rejected (%s): %s",
                match_id, resp.status_code, resp.text[:200],
            )
        except Exception as exc:
            logger.warning("OpenDota parse request failed for %s: %s", match_id, exc)
        finally:
            # Be polite even on failure — OpenDota's burst limit is unkind.
            time.sleep(1.0)
        return False

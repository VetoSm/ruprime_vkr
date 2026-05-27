"""Build normalized analytics rows from the best available match source."""

from __future__ import annotations

from dataclasses import asdict
from typing import Optional

from sqlalchemy.orm import Session

from app.match_detail_service import MatchDetailService
from app.models import PlayerMatch, PlayerMatchAnalytics, PlayerMatchDetail
from app.parse_queue import ANALYSIS_WINDOW
from app.sources import MatchDetailDTO, PlayerDetailDTO


def _won(radiant_win: Optional[bool], player_slot: Optional[int]) -> Optional[bool]:
    if radiant_win is None or player_slot is None:
        return None
    return bool(radiant_win) if int(player_slot) < 128 else not bool(radiant_win)


def _kda(kills, deaths, assists) -> Optional[float]:
    try:
        return round((float(kills or 0) + float(assists or 0)) / max(float(deaths or 0), 1.0), 2)
    except Exception:
        return None


def _find_player(dto: MatchDetailDTO | None, pm: PlayerMatch) -> PlayerDetailDTO | None:
    if not dto:
        return None
    for p in dto.players or []:
        try:
            if p.account_id is not None and int(p.account_id) == int(pm.account_id):
                return p
        except Exception:
            pass
    for p in dto.players or []:
        if p.player_slot == pm.player_slot and p.hero_id == pm.hero_id:
            return p
    for p in dto.players or []:
        if p.hero_id == pm.hero_id:
            return p
    return None


def _dto_from_detail(row: PlayerMatchDetail | None) -> MatchDetailDTO | None:
    if row is None or not row.raw_json:
        return None
    return MatchDetailService()._from_row(row)  # reuse source normalizers; no network request


def _snapshot_row(pm: PlayerMatch, detail: PlayerMatchDetail | None) -> dict:
    dto = _dto_from_detail(detail)
    player = _find_player(dto, pm)
    source = detail.source if detail and detail.is_parsed else "player_matches"

    slot = player.player_slot if player else pm.player_slot
    radiant_win = dto.radiant_win if dto and dto.radiant_win is not None else pm.radiant_win
    kills = player.kills if player else pm.kills
    deaths = player.deaths if player else pm.deaths
    assists = player.assists if player else pm.assists
    role = player.lane_role if player and player.lane_role else pm.lane_role

    extra = {}
    if player:
        raw_player = asdict(player)
        extra = {
            "has_detail": True,
            "items": raw_player.get("items"),
            "purchase_log_n": len(raw_player.get("purchase_log") or []),
            "ability_upgrades_n": len(raw_player.get("ability_upgrades") or []),
        }

    return {
        "account_id": pm.account_id,
        "match_id": pm.match_id,
        "source": source,
        "hero_id": player.hero_id if player else pm.hero_id,
        "role": role,
        "role_confidence": 1.0 if role else None,
        "start_time": dto.start_time if dto and dto.start_time else pm.start_time,
        "duration": dto.duration if dto and dto.duration else pm.duration,
        "game_mode": dto.game_mode if dto and dto.game_mode is not None else pm.game_mode,
        "lobby_type": dto.lobby_type if dto and dto.lobby_type is not None else pm.lobby_type,
        "radiant_win": radiant_win,
        "player_slot": slot,
        "win": _won(radiant_win, slot),
        "kills": kills,
        "deaths": deaths,
        "assists": assists,
        "kda": _kda(kills, deaths, assists),
        "gold_per_min": player.gold_per_min if player else pm.gold_per_min,
        "xp_per_min": player.xp_per_min if player else pm.xp_per_min,
        "last_hits": player.last_hits if player else pm.last_hits,
        "denies": player.denies if player else pm.denies,
        "hero_damage": player.hero_damage if player else pm.hero_damage,
        "tower_damage": player.tower_damage if player else pm.tower_damage,
        "hero_healing": player.hero_healing if player else pm.hero_healing,
        "net_worth": player.net_worth if player else None,
        "level": player.level if player else None,
        "obs_placed": player.obs_placed if player else pm.obs_placed,
        "sen_placed": player.sen_placed if player else pm.sen_placed,
        "teamfight_participation": player.teamfight_participation if player else None,
        "actions_per_min": player.actions_per_min if player else None,
        "extra": extra,
    }


def rebuild_player_match_analytics(db: Session, account_id: int, window: int = ANALYSIS_WINDOW) -> dict:
    rows = (
        db.query(PlayerMatch)
        .filter(PlayerMatch.account_id == int(account_id))
        .order_by(PlayerMatch.start_time.desc().nullslast())
        .limit(window)
        .all()
    )
    db.query(PlayerMatchAnalytics).filter(PlayerMatchAnalytics.account_id == int(account_id)).delete()
    if not rows:
        db.flush()
        return {"account_id": int(account_id), "rows": 0, "stratz_rows": 0}

    detail_by_match = {
        row.match_id: row
        for row in db.query(PlayerMatchDetail).filter(
            PlayerMatchDetail.match_id.in_([r.match_id for r in rows if r.match_id])
        ).all()
    }
    stratz_rows = 0
    for pm in rows:
        payload = _snapshot_row(pm, detail_by_match.get(pm.match_id))
        if payload["source"] == "stratz":
            stratz_rows += 1
        db.add(PlayerMatchAnalytics(**payload))
    db.flush()
    return {"account_id": int(account_id), "rows": len(rows), "stratz_rows": stratz_rows}


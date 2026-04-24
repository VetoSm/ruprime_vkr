"""
Background deep sync for player accounts.

Purpose:
- load more matches in background (without blocking /link-steam-account),
- request parse for more than a small recent subset,
- cache detailed rows for all players in fetched matches.
"""

import logging
import os
import threading
from datetime import datetime, timezone

from app.database import SessionLocal
from app.match_collector import request_match_parse
from app.models import PlayerAccount, PlayerMatch
from app.opendota_client import (
    account_id_to_steam_id,
    fetch_full_player_data,
    fetch_match_details,
)

logger = logging.getLogger(__name__)

DEEP_SYNC_MAX_MATCHES = max(500, int(os.getenv("PLAYER_DEEP_SYNC_MAX_MATCHES", "3000")))
DEEP_SYNC_DETAILED_MATCHES = max(25, int(os.getenv("PLAYER_DEEP_SYNC_DETAILED_MATCHES", "80")))

_state = {
    "running": False,
    "queue": [],
    "active_account_id": None,
    "jobs": {},  # account_id -> dict(status, timestamps, counters)
}
_lock = threading.Lock()


def get_sync_status(account_id: int | None = None) -> dict:
    with _lock:
        if account_id is not None:
            return dict(_state["jobs"].get(account_id) or {})
        return {
            "running": _state["running"],
            "active_account_id": _state["active_account_id"],
            "queue": list(_state["queue"]),
            "jobs": {k: dict(v) for k, v in _state["jobs"].items()},
        }


def schedule_deep_sync(account_id: int, steam_id: str | None = None, force: bool = False) -> dict:
    account_id = int(account_id)
    now = datetime.now(timezone.utc).isoformat()

    with _lock:
        job = dict(_state["jobs"].get(account_id) or {})
        is_running = job.get("status") == "running"
        is_queued = account_id in _state["queue"] or job.get("status") == "queued"

        if (is_running or is_queued) and not force:
            return {
                "status": "already_scheduled",
                "account_id": account_id,
                "job": job,
            }

        if account_id not in _state["queue"]:
            _state["queue"].append(account_id)

        job.update({
            "account_id": account_id,
            "steam_id": steam_id or job.get("steam_id"),
            "status": "queued",
            "requested_at": now,
            "message": "Запланирована фоновая догрузка матчей",
        })
        _state["jobs"][account_id] = job

        _ensure_worker_locked()
        return {
            "status": "queued",
            "account_id": account_id,
            "job": dict(job),
        }


def _ensure_worker_locked():
    if _state["running"]:
        return
    _state["running"] = True
    thread = threading.Thread(target=_worker_loop, daemon=True)
    thread.start()


def _worker_loop():
    while True:
        with _lock:
            if not _state["queue"]:
                _state["running"] = False
                _state["active_account_id"] = None
                return

            account_id = int(_state["queue"].pop(0))
            _state["active_account_id"] = account_id
            job = dict(_state["jobs"].get(account_id) or {})
            job.update({
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "message": "Идёт фоновая синхронизация",
                "last_error": None,
            })
            _state["jobs"][account_id] = job

        try:
            result = _run_sync_job(account_id, job.get("steam_id"))
            with _lock:
                cur = dict(_state["jobs"].get(account_id) or {})
                cur.update({
                    "status": "done",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "message": "Фоновая синхронизация завершена",
                    "fetched_matches": result.get("fetched_matches", 0),
                    "parse_requested": result.get("parse_requested", 0),
                    "detailed_matches_fetched": result.get("detailed_matches_fetched", 0),
                    "players_cached": result.get("players_cached", 0),
                })
                _state["jobs"][account_id] = cur
        except Exception as exc:
            logger.warning("Deep sync failed for account_id=%s: %s", account_id, exc)
            with _lock:
                cur = dict(_state["jobs"].get(account_id) or {})
                cur.update({
                    "status": "error",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "message": "Ошибка фоновой синхронизации",
                    "last_error": str(exc),
                })
                _state["jobs"][account_id] = cur


def _run_sync_job(account_id: int, steam_id: str | None) -> dict:
    db = SessionLocal()
    try:
        steam = steam_id
        if not steam:
            acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
            steam = acc.steam_id if acc and acc.steam_id else account_id_to_steam_id(account_id)

        data = fetch_full_player_data(steam, max_matches=DEEP_SYNC_MAX_MATCHES)
        if data.get("error"):
            raise RuntimeError(data["error"])

        account_id = int(data["account_id"])
        _save_player_account(db, data, steam)

        matches = data.get("matches") or []
        _replace_account_matches(db, account_id, matches)

        detailed_ids = [m.get("match_id") for m in matches[:DEEP_SYNC_DETAILED_MATCHES] if m.get("match_id")]
        parse_result = request_match_parse(detailed_ids, max_requests=DEEP_SYNC_DETAILED_MATCHES) if detailed_ids else {"requested": 0}

        detailed_matches_fetched, players_cached = _cache_other_players_from_detailed_matches(db, detailed_ids)
        db.commit()

        return {
            "fetched_matches": len(matches),
            "parse_requested": int(parse_result.get("requested") or 0),
            "detailed_matches_fetched": detailed_matches_fetched,
            "players_cached": players_cached,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _save_player_account(db, data: dict, steam_id: str):
    account_id = int(data["account_id"])
    acc = db.query(PlayerAccount).filter(PlayerAccount.account_id == account_id).first()
    if not acc:
        acc = PlayerAccount(account_id=account_id)
        db.add(acc)

    acc.steam_id = data.get("steam_id", steam_id)
    acc.personaname = data.get("personaname")
    acc.avatar_url = data.get("avatar_url")
    acc.rank_tier = data.get("rank_tier")
    acc.win = data.get("win", 0)
    acc.lose = data.get("lose", 0)
    acc.estimated_hours = data.get("estimated_hours", 0)
    acc.profile_url = data.get("profile_url")
    acc.is_public = data.get("is_public", True)
    acc.fetched_at = datetime.now(timezone.utc)

    if data.get("last_match_time"):
        try:
            acc.last_match_time = datetime.fromisoformat(data["last_match_time"])
        except Exception:
            pass

    totals = data.get("totals", {})
    lifetime_games = int(data.get("lifetime_games") or 0)
    parsed_games_n = int(data.get("parsed_games_n") or totals.get("parsed_games_n") or 0)
    acc.lifetime_games = lifetime_games
    acc.parsed_games_n = parsed_games_n
    acc.total_games = lifetime_games  # back-compat alias; same value
    acc.avg_gpm = totals.get("avg_gpm")
    acc.avg_xpm = totals.get("avg_xpm")
    acc.avg_kills = totals.get("avg_kills")
    acc.avg_deaths = totals.get("avg_deaths")
    acc.avg_assists = totals.get("avg_assists")
    acc.avg_last_hits = totals.get("avg_last_hits")
    acc.avg_denies = totals.get("avg_denies")
    acc.avg_hero_damage = totals.get("avg_hero_damage")
    acc.avg_tower_damage = totals.get("avg_tower_damage")
    acc.avg_duration = totals.get("avg_duration")
    acc.avg_hero_healing = totals.get("avg_hero_healing")
    acc.total_stuns = totals.get("total_stuns")
    acc.total_obs_placed = totals.get("total_obs")
    acc.total_sen_placed = totals.get("total_sen")
    acc.total_tower_kills = totals.get("total_tower_kills")


def _replace_account_matches(db, account_id: int, matches: list[dict]):
    db.query(PlayerMatch).filter(PlayerMatch.account_id == account_id).delete()
    for m in matches:
        db.add(_build_player_match(account_id, m, is_detailed=bool(m.get("is_detailed"))))


def _cache_other_players_from_detailed_matches(db, match_ids: list[int]) -> tuple[int, int]:
    fetched = 0
    players_cached = 0
    for match_id in match_ids:
        detailed = fetch_match_details(int(match_id))
        if not detailed:
            continue
        fetched += 1
        for row in _extract_players_from_match(detailed):
            if _upsert_player_match(db, row):
                players_cached += 1
    return fetched, players_cached


def _extract_players_from_match(match_data: dict) -> list[dict]:
    players = match_data.get("players") or []
    if not players:
        return []

    ranks = [p.get("rank_tier") for p in players if p.get("rank_tier")]
    avg_rank = int(sum(ranks) / len(ranks)) if ranks else None

    rows = []
    for p in players:
        account_id = p.get("account_id")
        hero_id = p.get("hero_id")
        if not account_id or not hero_id:
            continue

        rows.append({
            "account_id": int(account_id),
            "match_id": int(match_data.get("match_id") or 0),
            "hero_id": hero_id,
            "kills": p.get("kills"),
            "deaths": p.get("deaths"),
            "assists": p.get("assists"),
            "gold_per_min": p.get("gold_per_min"),
            "xp_per_min": p.get("xp_per_min"),
            "last_hits": p.get("last_hits"),
            "denies": p.get("denies"),
            "hero_damage": p.get("hero_damage"),
            "tower_damage": p.get("tower_damage"),
            "hero_healing": p.get("hero_healing"),
            "duration": match_data.get("duration"),
            "player_slot": p.get("player_slot"),
            "radiant_win": match_data.get("radiant_win"),
            "lane_role": p.get("lane_role"),
            "start_time": match_data.get("start_time"),
            "party_size": p.get("party_size"),
            "game_mode": match_data.get("game_mode"),
            "average_rank": p.get("rank_tier") or avg_rank,
            "is_detailed": True,
        })
    return rows


def _upsert_player_match(db, row: dict) -> bool:
    match_id = row.get("match_id")
    account_id = row.get("account_id")
    if not match_id or not account_id:
        return False

    existing = db.query(PlayerMatch).filter(
        PlayerMatch.account_id == account_id,
        PlayerMatch.match_id == match_id,
    ).order_by(PlayerMatch.id.desc()).first()

    if existing:
        existing.hero_id = row.get("hero_id")
        existing.kills = row.get("kills")
        existing.deaths = row.get("deaths")
        existing.assists = row.get("assists")
        existing.gold_per_min = row.get("gold_per_min")
        existing.xp_per_min = row.get("xp_per_min")
        existing.last_hits = row.get("last_hits")
        existing.denies = row.get("denies")
        existing.hero_damage = row.get("hero_damage")
        existing.tower_damage = row.get("tower_damage")
        existing.hero_healing = row.get("hero_healing")
        existing.duration = row.get("duration")
        existing.player_slot = row.get("player_slot")
        existing.radiant_win = row.get("radiant_win")
        existing.lane_role = row.get("lane_role")
        existing.start_time = row.get("start_time")
        existing.party_size = row.get("party_size")
        existing.game_mode = row.get("game_mode")
        existing.average_rank = row.get("average_rank")
        existing.is_detailed = bool(row.get("is_detailed"))
        return False

    db.add(_build_player_match(account_id, row, is_detailed=bool(row.get("is_detailed"))))
    return True


def _build_player_match(account_id: int, row: dict, is_detailed: bool) -> PlayerMatch:
    return PlayerMatch(
        account_id=account_id,
        match_id=row.get("match_id"),
        hero_id=row.get("hero_id"),
        kills=row.get("kills"),
        deaths=row.get("deaths"),
        assists=row.get("assists"),
        gold_per_min=row.get("gold_per_min"),
        xp_per_min=row.get("xp_per_min"),
        last_hits=row.get("last_hits"),
        denies=row.get("denies"),
        hero_damage=row.get("hero_damage"),
        tower_damage=row.get("tower_damage"),
        hero_healing=row.get("hero_healing"),
        duration=row.get("duration"),
        player_slot=row.get("player_slot"),
        radiant_win=row.get("radiant_win"),
        lane_role=row.get("lane_role"),
        start_time=row.get("start_time"),
        party_size=row.get("party_size"),
        game_mode=row.get("game_mode"),
        average_rank=row.get("average_rank"),
        is_detailed=is_detailed,
    )

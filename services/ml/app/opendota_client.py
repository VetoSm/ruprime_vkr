"""
OpenDota API Client.
Fetches player profile, totals, matches (with pagination), recent matches, heroes.
Free tier: 60 req/min. We use ~1.2s delay between requests.
"""

import time
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

OPENDOTA_BASE = "https://api.opendota.com/api"
STEAM_ID_BASE = 76561197960265728
REQUEST_TIMEOUT = 20.0
RATE_LIMIT_DELAY = 1.2


def steam_id_to_account_id(steam_id: str) -> int:
    sid = int(steam_id)
    return sid - STEAM_ID_BASE if sid > STEAM_ID_BASE else sid


def account_id_to_steam_id(account_id: int) -> str:
    return str(account_id + STEAM_ID_BASE)


def _request(method: str, path: str, retry: bool = True):
    url = f"{OPENDOTA_BASE}{path}"
    logger.info(f"OpenDota {method} {path}")
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.get(url) if method == "GET" else client.post(url)
        if resp.status_code == 200:
            try:
                return resp.json()
            except Exception:
                return None
        elif resp.status_code == 429 and retry:
            logger.warning("Rate limit 429, waiting 5s...")
            time.sleep(5)
            return _request(method, path, retry=False)
        else:
            logger.warning(f"OpenDota {resp.status_code}: {path}")
            return None
    except Exception as e:
        logger.error(f"OpenDota failed: {e}")
        return None


def _get(path): return _request("GET", path)
def _post(path): return _request("POST", path)


def refresh_player(account_id: int):
    _post(f"/players/{account_id}/refresh")
    logger.info(f"Refresh requested for {account_id}")


def fetch_player_profile(account_id: int) -> Optional[dict]:
    data = _get(f"/players/{account_id}")
    if not data:
        return None
    profile = data.get("profile") or {}
    return {
        "account_id": account_id,
        "steam_id": profile.get("steamid") or account_id_to_steam_id(account_id),
        "personaname": profile.get("personaname", "Unknown"),
        "avatar_url": profile.get("avatarfull") or profile.get("avatarmedium") or profile.get("avatar", ""),
        "profile_url": profile.get("profileurl", ""),
        "rank_tier": data.get("rank_tier"),
        "mmr_estimate": data.get("mmr_estimate") or data.get("solo_competitive_rank"),
        "is_public": bool(profile.get("profileurl")),
        "fh_unavailable": profile.get("fh_unavailable", False),
    }


def fetch_player_wl(account_id: int) -> dict:
    time.sleep(RATE_LIMIT_DELAY)
    data = _get(f"/players/{account_id}/wl")
    if not data or not isinstance(data, dict):
        return {"win": 0, "lose": 0}
    return {"win": data.get("win", 0), "lose": data.get("lose", 0)}


def fetch_player_totals(account_id: int) -> dict:
    """GET /players/{account_id}/totals -- lifetime aggregated stats."""
    time.sleep(RATE_LIMIT_DELAY)
    data = _get(f"/players/{account_id}/totals")
    if not data or not isinstance(data, list):
        return {}
    totals = {}
    for item in data:
        field = item.get("field")
        if field:
            n = item.get("n", 0)
            s = item.get("sum", 0)
            totals[field] = {
                "sum": s,
                "n": n,
                "avg": round(s / n, 2) if n > 0 else 0,
            }
    logger.info(f"Totals for {account_id}: {len(totals)} fields")
    return totals


def fetch_recent_matches(account_id: int) -> list[dict]:
    """GET /players/{account_id}/recentMatches -- last 20 with full stats."""
    time.sleep(RATE_LIMIT_DELAY)
    data = _get(f"/players/{account_id}/recentMatches")
    if not data or not isinstance(data, list):
        return []
    logger.info(f"RecentMatches for {account_id}: {len(data)} returned")
    matches = []
    for m in data:
        matches.append({
            "match_id": m.get("match_id"),
            "hero_id": m.get("hero_id"),
            "kills": m.get("kills"),
            "deaths": m.get("deaths"),
            "assists": m.get("assists"),
            "gold_per_min": m.get("gold_per_min"),
            "xp_per_min": m.get("xp_per_min"),
            "last_hits": m.get("last_hits"),
            "denies": m.get("denies"),
            "hero_damage": m.get("hero_damage"),
            "tower_damage": m.get("tower_damage"),
            "hero_healing": m.get("hero_healing"),
            "duration": m.get("duration"),
            "player_slot": m.get("player_slot"),
            "radiant_win": m.get("radiant_win"),
            "lane_role": m.get("lane_role"),
            "start_time": m.get("start_time"),
            "party_size": m.get("party_size"),
            "game_mode": m.get("game_mode"),
            "average_rank": m.get("average_rank"),
            "is_detailed": True,
        })
    return matches


def fetch_player_matches_paginated(account_id: int, max_matches: int = 500) -> list[dict]:
    """
    GET /players/{account_id}/matches with pagination.
    Basic fields only (kills/deaths/assists/hero_id/duration/start_time/average_rank).
    """
    all_matches = []
    pages = (max_matches + 99) // 100

    for page in range(pages):
        offset = page * 100
        time.sleep(RATE_LIMIT_DELAY)
        data = _get(f"/players/{account_id}/matches?limit=100&offset={offset}&significant=0")
        if not data or not isinstance(data, list) or len(data) == 0:
            break

        for m in data:
            all_matches.append({
                "match_id": m.get("match_id"),
                "hero_id": m.get("hero_id"),
                "kills": m.get("kills"),
                "deaths": m.get("deaths"),
                "assists": m.get("assists"),
                "gold_per_min": m.get("gold_per_min"),
                "xp_per_min": m.get("xp_per_min"),
                "last_hits": m.get("last_hits"),
                "hero_damage": m.get("hero_damage"),
                "tower_damage": m.get("tower_damage"),
                "hero_healing": m.get("hero_healing"),
                "denies": m.get("denies"),
                "duration": m.get("duration"),
                "player_slot": m.get("player_slot"),
                "radiant_win": m.get("radiant_win"),
                "lane_role": m.get("lane_role"),
                "start_time": m.get("start_time"),
                "party_size": m.get("party_size"),
                "game_mode": m.get("game_mode"),
                "average_rank": m.get("average_rank"),
                "is_detailed": False,
            })

        logger.info(f"Matches page {page+1}: got {len(data)}, total {len(all_matches)}")
        if len(data) < 100:
            break

    return all_matches


def fetch_player_heroes(account_id: int) -> list[dict]:
    time.sleep(RATE_LIMIT_DELAY)
    data = _get(f"/players/{account_id}/heroes")
    if not data or not isinstance(data, list):
        return []
    heroes = []
    for h in data:
        games = int(h.get("games", 0))
        if games == 0:
            continue
        heroes.append({
            "hero_id": int(h.get("hero_id", 0)),
            "games": games,
            "win": int(h.get("win", 0)),
            "winrate": round(int(h.get("win", 0)) / games, 3) if games > 0 else 0,
        })
    return sorted(heroes, key=lambda x: x["games"], reverse=True)


def fetch_player_rankings(account_id: int) -> list[dict]:
    """GET /players/{account_id}/rankings -- percentile rank per hero."""
    time.sleep(RATE_LIMIT_DELAY)
    data = _get(f"/players/{account_id}/rankings")
    if not data or not isinstance(data, list):
        return []
    rankings = []
    for r in data:
        hero_id = r.get("hero_id")
        pct = r.get("percent_rank")
        if hero_id and pct is not None:
            rankings.append({
                "hero_id": int(hero_id),
                "percent_rank": round(float(pct), 4),
                "score": round(float(r.get("score", 0)), 2),
            })
    return sorted(rankings, key=lambda x: x["percent_rank"], reverse=True)


def fetch_match_details(match_id: int) -> Optional[dict]:
    """GET /matches/{match_id} with per-player detailed stats."""
    time.sleep(RATE_LIMIT_DELAY)
    data = _get(f"/matches/{match_id}")
    if not data or not isinstance(data, dict):
        return None
    players = data.get("players")
    if not players or not isinstance(players, list):
        return None
    return data


def fetch_full_player_data(steam_id: str, max_matches: int = 500) -> dict:
    """Fetch everything: refresh -> profile -> wl -> totals -> recentMatches -> matches (paginated) -> heroes."""
    account_id = steam_id_to_account_id(steam_id)
    logger.info(f"=== Full fetch for steam_id={steam_id}, account_id={account_id} ===")

    # 0. Refresh
    refresh_player(account_id)
    time.sleep(2)

    # 1. Profile
    profile = fetch_player_profile(account_id)
    if not profile:
        return {"error": "Профиль не найден в OpenDota. Проверьте Steam ID и публичность профиля.", "account_id": account_id}

    # 2. Win/Loss
    wl = fetch_player_wl(account_id)

    # 3. Totals (lifetime averages)
    totals = fetch_player_totals(account_id)

    # 4. Recent matches (20, with full stats)
    recent = fetch_recent_matches(account_id)

    # 5. All matches (basic stats, configurable cap)
    all_matches = fetch_player_matches_paginated(account_id, max_matches=max_matches)

    # 6. Heroes
    heroes = fetch_player_heroes(account_id)

    # 7. Rankings (percentile per hero)
    rankings = fetch_player_rankings(account_id)

    # Merge: recent matches have full stats, overlay onto all_matches
    recent_ids = {m["match_id"] for m in recent}
    merged_matches = list(recent)  # start with detailed
    for m in all_matches:
        if m["match_id"] not in recent_ids:
            merged_matches.append(m)

    # Sort by start_time desc
    merged_matches.sort(key=lambda x: x.get("start_time") or 0, reverse=True)

    # Compute totals-based averages
    totals_n = totals.get("duration", {}).get("n", 0) or totals.get("kills", {}).get("n", 0)
    total_games_wl = wl.get("win", 0) + wl.get("lose", 0)
    total_games = max(totals_n, total_games_wl)

    def avg(field):
        t = totals.get(field, {})
        n = t.get("n", 0)
        return round(t.get("sum", 0) / n, 2) if n > 0 else None

    # Hours estimate
    dur_total = totals.get("duration", {}).get("sum", 0)
    estimated_hours = round(dur_total / 3600, 0) if dur_total > 0 else 0

    # Last match time
    last_match_time = None
    if merged_matches and merged_matches[0].get("start_time"):
        last_match_time = datetime.fromtimestamp(merged_matches[0]["start_time"], tz=timezone.utc).isoformat()

    # Warning for closed profiles
    warning = None
    if profile.get("fh_unavailable") or (wl["win"] == 0 and wl["lose"] == 0 and not merged_matches):
        warning = (
            "История матчей закрыта. Чтобы загрузить данные:\n"
            "1. Откройте Dota 2 → Настройки → Социальные сети\n"
            "2. Включите «Показывать данные матчей» (Expose Public Match Data)\n"
            "3. Подождите 5-10 минут и нажмите «Обновить данные»"
        )

    result = {
        "account_id": account_id,
        "steam_id": profile.get("steam_id", steam_id),
        "personaname": profile.get("personaname", "Unknown"),
        "avatar_url": profile.get("avatar_url", ""),
        "rank_tier": profile.get("rank_tier"),
        "mmr_estimate": profile.get("mmr_estimate"),
        "profile_url": profile.get("profile_url", ""),
        "is_public": profile.get("is_public", True),
        "win": wl.get("win", 0),
        "lose": wl.get("lose", 0),
        "estimated_hours": estimated_hours,
        "last_match_time": last_match_time,
        "matches": merged_matches,
        "heroes": heroes[:20],
        "rankings": rankings[:20],
        "matches_count": len(merged_matches),
        "total_games": total_games,
        "warning": warning,
        # Lifetime averages from /totals
        "totals": {
            "total_games": total_games,
            "avg_gpm": avg("gold_per_min"),
            "avg_xpm": avg("xp_per_min"),
            "avg_kills": avg("kills"),
            "avg_deaths": avg("deaths"),
            "avg_assists": avg("assists"),
            "avg_last_hits": avg("last_hits"),
            "avg_denies": avg("denies"),
            "avg_hero_damage": avg("hero_damage"),
            "avg_tower_damage": avg("tower_damage"),
            "avg_duration": avg("duration"),
            "avg_hero_healing": avg("hero_healing"),
            "total_stuns": totals.get("stuns", {}).get("sum"),
            "stuns_n": totals.get("stuns", {}).get("n"),
            "total_obs": totals.get("purchase_ward_observer", {}).get("sum"),
            "obs_n": totals.get("purchase_ward_observer", {}).get("n"),
            "total_sen": totals.get("purchase_ward_sentry", {}).get("sum"),
            "sen_n": totals.get("purchase_ward_sentry", {}).get("n"),
            "total_tower_kills": totals.get("tower_kills", {}).get("sum"),
            "tower_kills_n": totals.get("tower_kills", {}).get("n"),
            # Additional metrics
            "avg_actions_per_min": totals.get("actions_per_min", {}).get("avg"),
            "apm_n": totals.get("actions_per_min", {}).get("n"),
            "avg_lane_efficiency": totals.get("lane_efficiency_pct", {}).get("avg"),
            "lane_eff_n": totals.get("lane_efficiency_pct", {}).get("n"),
            "avg_neutral_kills": totals.get("neutral_kills", {}).get("avg"),
            "avg_level": totals.get("level", {}).get("avg"),
            "avg_pings": totals.get("pings", {}).get("avg"),
        },
    }

    logger.info(f"=== Result: {result['personaname']}, rank={result['rank_tier']}, "
                f"W/L={result['win']}/{result['lose']}, matches={result['matches_count']}, "
                f"hours={result['estimated_hours']}, total_games={total_games} ===")
    return result

"""Thin wrapper around the Steam Web API.

Used as a fallback / enrichment layer when OpenDota can't give us anything
(closed Dota match history, freshly linked account, OpenDota rate-limit).
Valve's Steam Web API always returns at least the persona and avatar for
any SteamID64, so we can show "who this is" in admin and the dashboard
even when we have no match data.

Scope:
- ``GetPlayerSummaries`` → personaname, avatar, profileurl, visibility.
- ``GetOwnedGames`` (filtered to Dota 2, appid=570) → total hours + last-played.

When STEAM_API_KEY is not configured the module short-circuits with ``None``
so the rest of the pipeline stays working without any key.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

STEAM_API_BASE = "https://api.steampowered.com"
DOTA2_APPID = 570
REQUEST_TIMEOUT = 10.0


def _api_key() -> Optional[str]:
    key = os.getenv("STEAM_API_KEY", "").strip()
    return key or None


def is_configured() -> bool:
    return _api_key() is not None


def fetch_player_summary(steam_id: str) -> Optional[dict]:
    """GET ISteamUser/GetPlayerSummaries — basic public profile card.

    Returns a normalised dict or None if Steam didn't answer. Never raises.
    ``communityvisibilitystate`` meaning: 1 = private, 2 = friends-only,
    3 = public.
    """
    key = _api_key()
    if not key:
        return None
    url = f"{STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/"
    params = {"key": key, "steamids": steam_id}
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.get(url, params=params)
    except httpx.RequestError as exc:
        logger.warning("Steam Web API error (summary): %s", exc)
        return None
    if resp.status_code != 200:
        logger.warning("Steam Web API %s for summary %s", resp.status_code, steam_id)
        return None
    players = ((resp.json() or {}).get("response") or {}).get("players") or []
    if not players:
        return None
    p = players[0]
    return {
        "steam_id": p.get("steamid") or steam_id,
        "personaname": p.get("personaname"),
        "avatar_url": p.get("avatarfull") or p.get("avatarmedium") or p.get("avatar"),
        "profile_url": p.get("profileurl"),
        "realname": p.get("realname"),
        "country_code": p.get("loccountrycode"),
        "community_visibility": p.get("communityvisibilitystate"),
        "persona_state": p.get("personastate"),
        "last_logoff": p.get("lastlogoff"),
    }


def fetch_dota_playtime(steam_id: str) -> Optional[dict]:
    """GET IPlayerService/GetOwnedGames filtered to Dota 2.

    Returns ``{"playtime_forever_min": int, "last_played": iso-or-None}``
    when the user shares their game library. Returns ``None`` if Steam
    either refuses (private library) or just has nothing for Dota 2.
    """
    key = _api_key()
    if not key:
        return None
    url = f"{STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/"
    params = {
        "key": key,
        "steamid": steam_id,
        "include_appinfo": 0,
        "include_played_free_games": 1,
        "appids_filter[0]": DOTA2_APPID,
    }
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.get(url, params=params)
    except httpx.RequestError as exc:
        logger.warning("Steam Web API error (owned games): %s", exc)
        return None
    if resp.status_code != 200:
        return None
    games = ((resp.json() or {}).get("response") or {}).get("games") or []
    if not games:
        return None
    g = games[0]
    last_played_ts = g.get("rtime_last_played") or 0
    last_played_iso = (
        datetime.fromtimestamp(last_played_ts, tz=timezone.utc).isoformat()
        if last_played_ts
        else None
    )
    return {
        "playtime_forever_min": int(g.get("playtime_forever") or 0),
        "last_played": last_played_iso,
    }


def enrich_profile(steam_id: str) -> dict:
    """Bundle everything Steam Web API can tell us about this user into one
    dict, suitable for merging on top of OpenDota data."""
    summary = fetch_player_summary(steam_id) or {}
    playtime = fetch_dota_playtime(steam_id) or {}
    hours = None
    if playtime.get("playtime_forever_min"):
        hours = round(playtime["playtime_forever_min"] / 60.0, 1)
    return {
        "steam_web_available": bool(summary) or bool(playtime),
        "personaname": summary.get("personaname"),
        "avatar_url": summary.get("avatar_url"),
        "profile_url": summary.get("profile_url"),
        "realname": summary.get("realname"),
        "country_code": summary.get("country_code"),
        "community_visibility": summary.get("community_visibility"),
        "steam_dota_hours": hours,
        "steam_dota_last_played": playtime.get("last_played"),
    }

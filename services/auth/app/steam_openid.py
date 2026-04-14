"""Steam OpenID 2.0 — вход без пароля (официальный поток Valve)."""
import urllib.parse
from typing import Optional

import httpx

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
CLAIMED_ID_PREFIX = "https://steamcommunity.com/openid/id/"


def build_steam_login_url(return_to: str, realm: str) -> str:
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID_URL}?{urllib.parse.urlencode(params)}"


def extract_steam_id_from_claimed(claimed_id: str) -> Optional[str]:
    if not claimed_id or not claimed_id.startswith(CLAIMED_ID_PREFIX):
        return None
    sid = claimed_id[len(CLAIMED_ID_PREFIX) :].strip()
    return sid if sid.isdigit() and len(sid) >= 15 else None


async def verify_steam_openid_callback(query_params: dict) -> Optional[str]:
    """
    Проверяет ответ Steam (openid.mode=id_res) через check_authentication.
    Возвращает SteamID64 или None.
    """
    mode = query_params.get("openid.mode")
    if mode != "id_res":
        return None

    claimed = query_params.get("openid.claimed_id") or query_params.get("openid.identity")
    steam_id = extract_steam_id_from_claimed(claimed or "")
    if not steam_id:
        return None

    verify_params = dict(query_params)
    verify_params["openid.mode"] = "check_authentication"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(STEAM_OPENID_URL, data=verify_params)

    if resp.status_code != 200:
        return None
    if "is_valid:true" not in resp.text:
        return None
    return steam_id

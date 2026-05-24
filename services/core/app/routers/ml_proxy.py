"""Proxy routes that forward from core to the internal ML service.

The ML service is not reachable from the public internet anymore. The browser
talks only to core, and core in turn calls ML over the private docker network
with a shared ``ML_INTERNAL_TOKEN``. That lets us keep the existing frontend
flows (hero catalog, admin imports, SSE import progress) while closing the
previously unauthenticated ML endpoints.

Routes:
- ``GET /ml/heroes`` — catalog of Dota heroes, authenticated users only.
- ``GET /ml/player-account/{account_id}`` — cached Steam-side profile
  (avatar, personaname, rank, lifetime games). Frontend uses it for the
  coach catalog avatars and for player meta on a player profile page.
  Authenticated users only — we don't expose this to anonymous traffic
  to avoid turning the proxy into a free Steam scraper.
- ``<ADMIN> /admin/ml/*``                     — proxied ML admin actions.
- ``<ADMIN> GET /admin/ml/import-progress``   — SSE stream, proxied as-is.
"""
from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_role
from app.models import CoachProfile, PlayerProfile

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ml-proxy"])

_DEFAULT_TIMEOUT = httpx.Timeout(60.0, connect=5.0)
_SSE_TIMEOUT = httpx.Timeout(None, connect=5.0)


def _ml_headers() -> dict[str, str]:
    return {"X-Internal-Token": settings.ML_INTERNAL_TOKEN}


async def _forward_json(method: str, path: str, *, params=None, json=None):
    url = f"{settings.ML_SERVICE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            resp = await client.request(
                method, url, params=params, json=json, headers=_ml_headers()
            )
    except httpx.RequestError as exc:
        logger.warning("ML proxy request failed: %s %s — %s", method, url, exc)
        raise HTTPException(status_code=502, detail="ML service unavailable") from exc

    try:
        payload = resp.json()
    except ValueError:
        payload = {"raw": resp.text}
    return JSONResponse(status_code=resp.status_code, content=payload)


# ---------- Public catalog ----------

@router.get("/ml/heroes")
async def proxy_ml_heroes(_: CurrentUser = Depends(get_current_user)):
    """Hero catalog used by the frontend cache."""
    return await _forward_json("GET", "/ml/heroes")


def _account_id_is_visible(
    account_id: int,
    current_user: CurrentUser,
    db: Session,
) -> bool:
    """Whether the current user is allowed to read this Steam-side cache.

    We don't want to be a Steam-profile enumerator. Callers may only ask
    about:

      1. Their own ``dota_account_id`` (own avatar / profile pages).
      2. The ``dota_account_id`` of any verified coach (so the catalog
         can show avatars). Coaches opt into being publicly listed when
         they get verified, so their basic Steam-side profile is
         considered effectively public.

    Admins bypass the check (they manage everyone). Everyone else gets
    a 403 — even though the underlying data is technically public on
    Steam, the proxy must not be a free batch-lookup tool.
    """
    if current_user.role == "ADMIN":
        return True

    me = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if me and me.dota_account_id and me.dota_account_id.isdigit():
        if int(me.dota_account_id) == account_id:
            return True

    # Any verified coach is fair game (their card is in the public catalog).
    coach_owner = (
        db.query(PlayerProfile.id)
        .join(CoachProfile, CoachProfile.core_user_id == PlayerProfile.core_user_id)
        .filter(CoachProfile.is_verified == True)  # noqa: E712
        .filter(PlayerProfile.dota_account_id == str(account_id))
        .first()
    )
    return coach_owner is not None


@router.get("/ml/player-account/{account_id}")
async def proxy_ml_player_account(
    account_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cached ``player_accounts`` row for an account the caller is
    allowed to see.

    Used by the frontend to render avatars on the coach catalog and on
    the player's own pages. The ACL above ensures the endpoint can't be
    abused to scrape arbitrary Steam profiles in batch.
    """
    if not _account_id_is_visible(account_id, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Access to this Steam profile is not permitted.",
        )
    return await _forward_json("GET", f"/ml/player-account/{account_id}")


# ---------- Admin imports / training ----------

@router.post("/admin/ml/start-import")
async def admin_start_import(
    request: Request,
    _: CurrentUser = Depends(require_role("ADMIN")),
):
    body = await request.json()
    return await _forward_json("POST", "/ml/admin/start-import", json=body)


@router.post("/admin/ml/cancel-import")
async def admin_cancel_import(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("POST", "/ml/admin/cancel-import")


@router.get("/admin/ml/import-status")
async def admin_import_status(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("GET", "/ml/admin/import-status")


@router.post("/admin/ml/load-constants")
async def admin_load_constants(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("POST", "/ml/admin/load-constants")


@router.post("/admin/ml/compute-baselines")
async def admin_compute_baselines(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("POST", "/ml/admin/compute-baselines")


@router.post("/admin/ml/train-mmr-model")
async def admin_train_mmr_model(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("POST", "/ml/admin/train-mmr-model")


@router.post("/admin/ml/start-training")
async def admin_start_training(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("POST", "/ml/admin/start-training")


@router.get("/admin/ml/training-status")
async def admin_training_status(_: CurrentUser = Depends(require_role("ADMIN"))):
    return await _forward_json("GET", "/ml/admin/training-status")


# ---------- Admin SSE progress ----------

@router.get("/admin/ml/import-progress")
async def admin_import_progress(_: CurrentUser = Depends(require_role("ADMIN"))):
    """SSE passthrough. Streams raw bytes from the ML import-progress channel."""
    url = f"{settings.ML_SERVICE_URL}/ml/admin/import-progress"

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=_SSE_TIMEOUT) as client:
                async with client.stream("GET", url, headers=_ml_headers()) as resp:
                    if resp.status_code != 200:
                        detail = await resp.aread()
                        yield (
                            f"event: error\ndata: ML returned {resp.status_code}: "
                            f"{detail.decode('utf-8', 'ignore')}\n\n"
                        ).encode("utf-8")
                        return
                    async for chunk in resp.aiter_raw():
                        if chunk:
                            yield chunk
        except (httpx.RequestError, asyncio.CancelledError) as exc:
            logger.warning("SSE proxy aborted: %s", exc)
            return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store"},
    )

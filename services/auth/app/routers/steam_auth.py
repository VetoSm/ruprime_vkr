"""
Steam OpenID login.

Two modes are supported:

- Bare login (existing accounts): user clicks "Войти через Steam", we open
  the Valve OpenID page and on success return tokens to the frontend.

- Coach signup: before the Steam redirect the frontend asks
  ``/auth/steam/login?signup=coach``. We set a short-lived, HMAC-signed
  cookie ``steam_signup_role=COACH`` so the callback (which Valve reaches
  with its own URL) can read it and mark the freshly created account as
  a PENDING coach application. OpenID 2.0 doesn't have a "state" parameter
  we can pass around, so an HttpOnly cookie is the standard workaround.
"""
import hashlib
import hmac
import secrets
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    AuthUser,
    AuthSession,
    AuthProvider,
    RoleEnum,
    CoachApplicationStatus,
)
from app.routers.auth import get_current_user
from app.security import (
    hash_password,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.steam_openid import build_steam_login_url, verify_steam_openid_callback

router = APIRouter(tags=["auth-steam"])

SIGNUP_COOKIE = "steam_signup_role"
SIGNUP_COOKIE_TTL_SEC = 600  # 10 minutes is plenty for the Steam round trip.

LINK_COOKIE = "steam_link_user_id"
LINK_COOKIE_TTL_SEC = 600


def _sign_signup_value(role: str) -> str:
    """Return ``<role>.<expires_at>.<hex_hmac>``. Verifiable only by us."""
    expires = int(time.time()) + SIGNUP_COOKIE_TTL_SEC
    payload = f"{role}.{expires}"
    sig = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{sig}"


def _sign_link_value(user_id: int) -> str:
    expires = int(time.time()) + LINK_COOKIE_TTL_SEC
    payload = f"{user_id}.{expires}"
    sig = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{sig}"


def _read_link_value(raw: str | None) -> int | None:
    if not raw:
        return None
    parts = raw.split(".")
    if len(parts) != 3:
        return None
    uid_str, expires_str, sig = parts
    try:
        user_id = int(uid_str)
        expires = int(expires_str)
    except ValueError:
        return None
    if expires < int(time.time()):
        return None
    expected = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        f"{user_id}.{expires}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    return user_id


def _read_signup_value(raw: str | None) -> str | None:
    if not raw:
        return None
    parts = raw.split(".")
    if len(parts) != 3:
        return None
    role, expires_str, sig = parts
    try:
        expires = int(expires_str)
    except ValueError:
        return None
    if expires < int(time.time()):
        return None
    expected = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        f"{role}.{expires}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    return role.upper() if role.upper() in ("PLAYER", "COACH") else None


def _issue_tokens(request: Request, user: AuthUser, db: Session) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.role.value, is_active=user.is_active)
    raw_refresh = generate_refresh_token()
    hashed = hash_refresh_token(raw_refresh)
    session = AuthSession(
        user_id=user.id,
        refresh_token=hashed,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRES_DAYS),
    )
    db.add(session)
    db.commit()
    return access_token, raw_refresh


def _find_or_create_steam_user(
    db: Session, steam_id: str, signup_role: str | None
) -> tuple[AuthUser, bool]:
    """Look up by provider; create a PLAYER account if not found.

    ``signup_role`` comes from the signed signup cookie. A value of ``COACH``
    does not grant the role — it only flags the new user's coach application
    as PENDING so the tech account can approve.
    """
    prov = (
        db.query(AuthProvider)
        .filter(
            AuthProvider.provider == "STEAM",
            AuthProvider.provider_user_id == steam_id,
        )
        .first()
    )
    if prov:
        user = db.query(AuthUser).filter(AuthUser.id == prov.user_id).first()
        if user and user.is_active:
            # If an existing player resubmits as coach via Steam and has no
            # pending request yet, honour it.
            if (
                signup_role == "COACH"
                and user.role == RoleEnum.PLAYER
                and user.coach_application_status == CoachApplicationStatus.NONE
            ):
                user.coach_application_status = CoachApplicationStatus.PENDING
                user.coach_application_requested_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(user)
            return user, False
        if prov and not user:
            db.delete(prov)
            db.commit()

    login = f"steam_{steam_id}"
    email = f"steam.{steam_id}@ruprime.local"
    if db.query(AuthUser).filter(AuthUser.login == login).first():
        login = f"steam_{steam_id}_{secrets.token_hex(3)}"
    if db.query(AuthUser).filter(AuthUser.email == email).first():
        email = f"steam.{steam_id}.{secrets.token_hex(3)}@ruprime.local"

    application_status = (
        CoachApplicationStatus.PENDING if signup_role == "COACH" else CoachApplicationStatus.NONE
    )
    requested_at = datetime.now(timezone.utc) if signup_role == "COACH" else None

    user = AuthUser(
        login=login,
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(48)),
        role=RoleEnum.PLAYER,  # Steam accounts start as PLAYER, never COACH.
        is_active=True,
        is_verified=True,
        coach_application_status=application_status,
        coach_application_requested_at=requested_at,
    )
    db.add(user)
    db.flush()
    db.add(
        AuthProvider(
            user_id=user.id,
            provider="STEAM",
            provider_user_id=steam_id,
        )
    )
    db.commit()
    db.refresh(user)
    return user, True


@router.post("/steam/link-intent")
def steam_link_intent(
    response: JSONResponse = None,  # noqa: B008 — placeholder; we return a fresh JSONResponse
    current_user: AuthUser = Depends(get_current_user),
):
    """Issue a signed cookie that authorises the next Steam OpenID round trip
    to attach the returned Steam account to the currently logged-in user.

    The frontend calls this endpoint (JWT required), then navigates the browser
    to ``GET /auth/steam/login?mode=link``. Valve will bounce back to
    ``/auth/steam/callback`` and the callback verifies the cookie signature
    before linking, so nobody can force-link someone else's account.
    """
    jr = JSONResponse({"ok": True, "expires_in": LINK_COOKIE_TTL_SEC})
    jr.set_cookie(
        key=LINK_COOKIE,
        value=_sign_link_value(current_user.id),
        max_age=LINK_COOKIE_TTL_SEC,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return jr


@router.get("/steam/login")
def steam_login_begin(
    signup: str | None = Query(default=None, description="'coach' to flag as coach application"),
    mode: str | None = Query(default=None, description="'link' to attach Steam to authed user"),
):
    """Redirect to Steam.

    Supports three entry modes:

    * default      — sign in / create a PLAYER account when OpenID succeeds;
    * signup=coach — same, but the created account gets a PENDING coach app;
    * mode=link    — attach the returned Steam identity to the already
                     authenticated user; caller must have called
                     ``/auth/steam/link-intent`` first so the signed cookie
                     is present.
    """
    if not settings.STEAM_OPENID_ENABLED:
        return RedirectResponse(
            url=f"{settings.FRONTEND_STEAM_REDIRECT}?error=steam_disabled",
            status_code=302,
        )
    url = build_steam_login_url(settings.STEAM_RETURN_URL, settings.STEAM_REALM)
    response = RedirectResponse(url=url, status_code=302)

    requested_role = (signup or "").upper()
    if requested_role == "COACH":
        response.set_cookie(
            key=SIGNUP_COOKIE,
            value=_sign_signup_value("COACH"),
            max_age=SIGNUP_COOKIE_TTL_SEC,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
    # mode=link itself is a hint for the frontend; the actual linking
    # decision on the callback side is driven by the signed cookie that the
    # /steam/link-intent endpoint set earlier.
    return response


@router.get("/steam/callback")
async def steam_login_callback(request: Request, db: Session = Depends(get_db)):
    """Steam OpenID callback. Verifies, issues tokens, redirects to frontend."""
    if not settings.STEAM_OPENID_ENABLED:
        return RedirectResponse(
            url=f"{settings.FRONTEND_STEAM_REDIRECT}?error=steam_disabled",
            status_code=302,
        )

    q = dict(request.query_params)
    steam_id = await verify_steam_openid_callback(q)
    if not steam_id:
        return RedirectResponse(
            url=f"{settings.FRONTEND_STEAM_REDIRECT}?error=steam_auth_failed",
            status_code=302,
        )

    # Branch 1: a link-intent cookie is present — attach Steam to the existing
    # authenticated user instead of creating a new account.
    link_user_id = _read_link_value(request.cookies.get(LINK_COOKIE))
    if link_user_id is not None:
        target_user = db.query(AuthUser).filter(AuthUser.id == link_user_id).first()
        if not target_user or not target_user.is_active:
            return RedirectResponse(
                url=f"{settings.FRONTEND_STEAM_REDIRECT}?error=steam_link_user_invalid",
                status_code=302,
            )
        # Refuse if this Steam account is already linked to somebody else.
        existing = (
            db.query(AuthProvider)
            .filter(
                AuthProvider.provider == "STEAM",
                AuthProvider.provider_user_id == steam_id,
            )
            .first()
        )
        if existing and existing.user_id != target_user.id:
            response = RedirectResponse(
                url=f"{settings.FRONTEND_STEAM_REDIRECT}?error=steam_already_linked",
                status_code=302,
            )
            response.delete_cookie(LINK_COOKIE, path="/")
            return response

        if existing and existing.user_id == target_user.id:
            existing.provider_user_id = steam_id  # no-op, but safe
        else:
            db.add(AuthProvider(
                user_id=target_user.id,
                provider="STEAM",
                provider_user_id=steam_id,
            ))
        db.commit()

        frag_parts = [
            f"steam_id={urllib.parse.quote(steam_id, safe='')}",
            "linked=1",
        ]
        target = f"{settings.FRONTEND_STEAM_REDIRECT}#{'&'.join(frag_parts)}"
        response = RedirectResponse(url=target, status_code=302)
        response.delete_cookie(LINK_COOKIE, path="/")
        return response

    # Branch 2: regular sign-in / sign-up.
    signup_role = _read_signup_value(request.cookies.get(SIGNUP_COOKIE))
    user, _created = _find_or_create_steam_user(db, steam_id, signup_role)
    access_token, refresh_token = _issue_tokens(request, user, db)

    frag_parts = [
        f"access_token={urllib.parse.quote(access_token, safe='')}",
        f"refresh_token={urllib.parse.quote(refresh_token, safe='')}",
        f"steam_id={urllib.parse.quote(steam_id, safe='')}",
    ]
    if user.coach_application_status == CoachApplicationStatus.PENDING:
        frag_parts.append("coach_application=pending")

    target = f"{settings.FRONTEND_STEAM_REDIRECT}#{'&'.join(frag_parts)}"
    response = RedirectResponse(url=target, status_code=302)
    response.delete_cookie(SIGNUP_COOKIE, path="/")
    return response

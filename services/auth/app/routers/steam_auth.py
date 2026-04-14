"""
Вход через Steam OpenID.
Без Steam — как раньше (email + пароль + привязка Steam ID в настройках).
Со Steam — после входа фронт получает токены и автоматически вызывает Core link-steam.
"""
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import AuthUser, AuthSession, AuthProvider, RoleEnum
from app.security import (
    hash_password,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.steam_openid import build_steam_login_url, verify_steam_openid_callback

router = APIRouter(tags=["auth-steam"])


def _issue_tokens(request: Request, user: AuthUser, db: Session) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.role.value)
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


def _find_or_create_steam_user(db: Session, steam_id: str) -> AuthUser:
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
            return user
        if prov and not user:
            db.delete(prov)
            db.commit()

    login = f"steam_{steam_id}"
    email = f"steam.{steam_id}@ruprime.local"
    if db.query(AuthUser).filter(AuthUser.login == login).first():
        login = f"steam_{steam_id}_{secrets.token_hex(3)}"
    if db.query(AuthUser).filter(AuthUser.email == email).first():
        email = f"steam.{steam_id}.{secrets.token_hex(3)}@ruprime.local"

    user = AuthUser(
        login=login,
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(48)),
        role=RoleEnum.PLAYER,
        is_active=True,
        is_verified=True,
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
    return user


@router.get("/steam/login")
def steam_login_begin():
    """Редирект на страницу входа Steam."""
    if not settings.STEAM_OPENID_ENABLED:
        return RedirectResponse(
            url=f"{settings.FRONTEND_STEAM_REDIRECT}?error=steam_disabled",
            status_code=302,
        )
    url = build_steam_login_url(settings.STEAM_RETURN_URL, settings.STEAM_REALM)
    return RedirectResponse(url=url, status_code=302)


@router.get("/steam/callback")
async def steam_login_callback(request: Request, db: Session = Depends(get_db)):
    """Steam возвращает сюда после авторизации; выдаём JWT и редирект на фронт."""
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

    user = _find_or_create_steam_user(db, steam_id)
    access_token, refresh_token = _issue_tokens(request, user, db)

    frag = "&".join(
        [
            f"access_token={urllib.parse.quote(access_token, safe='')}",
            f"refresh_token={urllib.parse.quote(refresh_token, safe='')}",
            f"steam_id={urllib.parse.quote(steam_id, safe='')}",
        ]
    )
    target = f"{settings.FRONTEND_STEAM_REDIRECT}#{frag}"
    return RedirectResponse(url=target, status_code=302)

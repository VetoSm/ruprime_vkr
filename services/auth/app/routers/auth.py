from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuthUser, AuthSession, AuthProvider, RoleEnum
from app.schemas import (
    RegisterRequest, RegisterResponse, LoginRequest, TokenResponse,
    RefreshRequest, UserResponse, LogoutRequest, LinkSteamRequest,
    LinkSteamResponse, MessageResponse,
)
from app.security import (
    hash_password, verify_password, create_access_token,
    decode_access_token, generate_refresh_token, hash_refresh_token,
)
from app.config import settings
from app.rate_limit import check_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_user(request: Request, db: Session = Depends(get_db)) -> AuthUser:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = int(payload.get("sub", 0))
    user = db.query(AuthUser).filter(AuthUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is deactivated")
    return user


# ---------- POST /auth/register ----------
@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = check_rate_limit("register_ip", client_ip, max_requests=20, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many registration attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    # Validate passwords match
    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    # Validate role
    role_upper = body.role.upper()
    if role_upper not in ("PLAYER", "COACH"):
        raise HTTPException(status_code=400, detail="Role must be PLAYER or COACH")

    # Check email uniqueness
    existing_email = db.query(AuthUser).filter(AuthUser.email == body.email).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="User with this email already exists")

    # Check login uniqueness
    existing_login = db.query(AuthUser).filter(AuthUser.login == body.login).first()
    if existing_login:
        raise HTTPException(status_code=409, detail="User with this login already exists")

    user = AuthUser(
        login=body.login.strip(),
        email=body.email.strip(),
        password_hash=hash_password(body.password),
        role=RoleEnum(role_upper),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return RegisterResponse(
        id=user.id,
        email=user.email,
        login=user.login,
        role=user.role.value,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
    )


# ---------- POST /auth/login ----------
@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = check_rate_limit("login_ip", client_ip, max_requests=40, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.query(AuthUser).filter(AuthUser.email == body.email.strip()).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is deactivated")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(user.id, user.role.value)
    raw_refresh = generate_refresh_token()
    hashed_refresh = hash_refresh_token(raw_refresh)

    session = AuthSession(
        user_id=user.id,
        refresh_token=hashed_refresh,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRES_DAYS),
    )
    db.add(session)
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.JWT_ACCESS_EXPIRES_MIN * 60,
    )


# ---------- POST /auth/refresh ----------
@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = check_rate_limit("refresh_ip", client_ip, max_requests=80, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many refresh attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    hashed = hash_refresh_token(body.refresh_token)
    session = db.query(AuthSession).filter(AuthSession.refresh_token == hashed).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if session.revoked:
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")
    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token has expired")

    user = db.query(AuthUser).filter(AuthUser.id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="User is deactivated")

    # Revoke old, create new
    session.revoked = True

    new_access = create_access_token(user.id, user.role.value)
    new_raw_refresh = generate_refresh_token()
    new_hashed = hash_refresh_token(new_raw_refresh)

    new_session = AuthSession(
        user_id=user.id,
        refresh_token=new_hashed,
        user_agent=session.user_agent,
        ip_address=session.ip_address,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRES_DAYS),
    )
    db.add(new_session)
    db.commit()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_raw_refresh,
        expires_in=settings.JWT_ACCESS_EXPIRES_MIN * 60,
    )


# ---------- GET /auth/me ----------
@router.get("/me", response_model=UserResponse)
def me(current_user: AuthUser = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        login=current_user.login,
        role=current_user.role.value,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
    )


# ---------- POST /auth/logout ----------
@router.post("/logout", response_model=MessageResponse)
def logout(body: LogoutRequest, current_user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    hashed = hash_refresh_token(body.refresh_token)
    session = db.query(AuthSession).filter(
        AuthSession.refresh_token == hashed,
        AuthSession.user_id == current_user.id,
    ).first()
    if session:
        session.revoked = True
        db.commit()
    return MessageResponse(message="Logged out successfully")


# ---------- POST /auth/logout-all ----------
@router.post("/logout-all", response_model=MessageResponse)
def logout_all(current_user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(AuthSession).filter(
        AuthSession.user_id == current_user.id,
        AuthSession.revoked == False,
    ).update({"revoked": True})
    db.commit()
    return MessageResponse(message="All sessions revoked")


# ---------- POST /auth/change-password ----------
@router.post("/change-password", response_model=MessageResponse)
def change_password(
    body: dict,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    old_password = body.get("old_password", "")
    new_password = body.get("new_password", "")

    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Минимум 8 символов")

    current_user.password_hash = hash_password(new_password)
    db.commit()
    return MessageResponse(message="Пароль изменён")


# ---------- POST /auth/link-steam ----------
@router.post("/link-steam", response_model=LinkSteamResponse)
def link_steam(body: LinkSteamRequest, current_user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    # In production, validate steam_token via Steam OpenID / Web API
    # For now, we treat steam_token as the steam_id directly (stub)
    steam_id = body.steam_token.strip()
    if not steam_id:
        raise HTTPException(status_code=400, detail="Invalid steam token")

    # Check if this steam_id is already linked to another user
    existing = db.query(AuthProvider).filter(
        AuthProvider.provider == "STEAM",
        AuthProvider.provider_user_id == steam_id,
    ).first()
    if existing and existing.user_id != current_user.id:
        raise HTTPException(status_code=409, detail="This Steam account is already linked to another user")

    # Check if user already has a Steam provider
    user_provider = db.query(AuthProvider).filter(
        AuthProvider.user_id == current_user.id,
        AuthProvider.provider == "STEAM",
    ).first()
    if user_provider:
        user_provider.provider_user_id = steam_id
    else:
        user_provider = AuthProvider(
            user_id=current_user.id,
            provider="STEAM",
            provider_user_id=steam_id,
        )
        db.add(user_provider)

    db.commit()
    return LinkSteamResponse(provider="STEAM", provider_user_id=steam_id, linked=True)

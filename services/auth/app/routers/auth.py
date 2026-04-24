from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuthUser, AuthSession, AuthProvider, RoleEnum, CoachApplicationStatus
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

    # Validate role. New policy (Iteration 2):
    #   - Users can choose PLAYER or COACH on the registration form.
    #   - We never grant the COACH role on registration. The account is
    #     always created as PLAYER; a COACH choice is recorded as a PENDING
    #     coach application and must be approved by the tech account.
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

    application_status = (
        CoachApplicationStatus.PENDING if role_upper == "COACH" else CoachApplicationStatus.NONE
    )
    requested_at = datetime.now(timezone.utc) if role_upper == "COACH" else None

    user = AuthUser(
        login=body.login.strip(),
        email=body.email.strip(),
        password_hash=hash_password(body.password),
        role=RoleEnum.PLAYER,
        is_active=True,
        is_verified=False,
        coach_application_status=application_status,
        coach_application_requested_at=requested_at,
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
        coach_application_status=user.coach_application_status.value,
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

    access_token = create_access_token(user.id, user.role.value, is_active=user.is_active)
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

    new_access = create_access_token(user.id, user.role.value, is_active=user.is_active)
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
        coach_application_status=current_user.coach_application_status.value,
    )


# ---------- POST /auth/admin/users/{id}/role ----------
@router.post("/admin/users/{user_id}/role", response_model=UserResponse)
def admin_set_user_role(
    user_id: int,
    body: dict,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin-only change of a user's role.

    Allowed target values: ``PLAYER``, ``COACH``, ``ADMIN``. Sessions stay
    valid — the existing access tokens keep working until they expire, and
    the next silent refresh issues a token with the new role claim.

    The call is idempotent (setting the same role returns 200). Demoting
    the last ADMIN is refused so we can't lock ourselves out.
    """
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")

    new_role_str = str(body.get("role", "")).upper()
    if new_role_str not in ("PLAYER", "COACH", "ADMIN"):
        raise HTTPException(status_code=400, detail="role must be PLAYER, COACH or ADMIN")
    new_role = RoleEnum(new_role_str)

    target = db.query(AuthUser).filter(AuthUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Safety: refuse to demote the last remaining ADMIN.
    if target.role == RoleEnum.ADMIN and new_role != RoleEnum.ADMIN:
        admin_count = db.query(AuthUser).filter(AuthUser.role == RoleEnum.ADMIN).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Нельзя убрать роль у последнего администратора")

    if target.role == new_role:
        # nothing to do, but still keep the coach application bookkeeping
        # consistent (e.g. APPROVED if already a coach).
        return UserResponse(
            id=target.id,
            email=target.email,
            login=target.login,
            role=target.role.value,
            is_active=target.is_active,
            is_verified=target.is_verified,
            coach_application_status=target.coach_application_status.value,
        )

    target.role = new_role
    if new_role == RoleEnum.COACH:
        target.coach_application_status = CoachApplicationStatus.APPROVED
        if not target.coach_approved_at:
            target.coach_approved_at = datetime.now(timezone.utc)
    elif new_role == RoleEnum.PLAYER and target.coach_application_status == CoachApplicationStatus.APPROVED:
        # Manual demotion: mark as rejected so the "approved" badge goes away.
        target.coach_application_status = CoachApplicationStatus.REJECTED

    db.commit()
    db.refresh(target)
    return UserResponse(
        id=target.id,
        email=target.email,
        login=target.login,
        role=target.role.value,
        is_active=target.is_active,
        is_verified=target.is_verified,
        coach_application_status=target.coach_application_status.value,
    )


# ---------- GET /auth/admin/users-lite ----------
@router.get("/admin/users-lite")
def admin_list_users_lite(
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every auth user with their Steam-provider link. Admin only.

    Used by the core ``/admin/users-full`` endpoint which joins this against
    core profiles and ML data. Kept separate from /admin/coach-applications
    so admins can see users who never submitted a coach application.
    """
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")

    providers = db.query(AuthProvider).filter(AuthProvider.provider == "STEAM").all()
    provider_by_user = {p.user_id: p.provider_user_id for p in providers}
    users = db.query(AuthUser).order_by(AuthUser.id.desc()).all()
    return {
        "items": [
            {
                "id": u.id,
                "login": u.login,
                "email": u.email,
                "role": u.role.value,
                "is_active": u.is_active,
                "is_verified": u.is_verified,
                "coach_application_status": u.coach_application_status.value,
                "coach_application_requested_at": u.coach_application_requested_at.isoformat()
                if u.coach_application_requested_at
                else None,
                "coach_approved_at": u.coach_approved_at.isoformat() if u.coach_approved_at else None,
                "steam_id": provider_by_user.get(u.id),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }


# ---------- GET /auth/admin/coach-applications ----------
@router.get("/admin/coach-applications")
def list_coach_applications(
    status: str | None = None,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List users with a coach application. Admin only.

    ``status`` filter accepts ``PENDING`` / ``APPROVED`` / ``REJECTED``.
    Default returns everything that is not NONE.
    """
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")

    q = db.query(AuthUser).filter(
        AuthUser.coach_application_status != CoachApplicationStatus.NONE
    )
    if status:
        try:
            status_enum = CoachApplicationStatus(status.upper())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")
        q = q.filter(AuthUser.coach_application_status == status_enum)

    users = q.order_by(AuthUser.coach_application_requested_at.desc().nullslast()).all()
    return {
        "items": [
            {
                "id": u.id,
                "login": u.login,
                "email": u.email,
                "role": u.role.value,
                "coach_application_status": u.coach_application_status.value,
                "coach_application_requested_at": u.coach_application_requested_at.isoformat()
                if u.coach_application_requested_at
                else None,
                "coach_approved_at": u.coach_approved_at.isoformat() if u.coach_approved_at else None,
            }
            for u in users
        ]
    }


# ---------- POST /auth/apply-coach ----------
@router.post("/apply-coach", response_model=UserResponse)
def apply_for_coach(current_user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """User-initiated request to become a coach.

    Works for an already-registered PLAYER. Keeps role=PLAYER until the tech
    account approves. Idempotent: resubmitting a pending request is a no-op.
    """
    if current_user.role == RoleEnum.ADMIN:
        raise HTTPException(status_code=400, detail="Администратор не может подать заявку в тренеры")
    if current_user.role == RoleEnum.COACH:
        raise HTTPException(status_code=400, detail="Вы уже тренер")

    if current_user.coach_application_status != CoachApplicationStatus.PENDING:
        current_user.coach_application_status = CoachApplicationStatus.PENDING
        current_user.coach_application_requested_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(current_user)

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        login=current_user.login,
        role=current_user.role.value,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        coach_application_status=current_user.coach_application_status.value,
    )


# ---------- POST /auth/admin/coach-applications/{user_id}/approve ----------
@router.post("/admin/coach-applications/{user_id}/approve", response_model=UserResponse)
def approve_coach_application(
    user_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve a pending coach application. Requires ADMIN role."""
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Только администратор может подтверждать тренеров")

    target = db.query(AuthUser).filter(AuthUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.coach_application_status != CoachApplicationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Нет заявки в ожидании для этого пользователя")

    target.role = RoleEnum.COACH
    target.coach_application_status = CoachApplicationStatus.APPROVED
    target.coach_approved_at = datetime.now(timezone.utc)
    # Intentionally NOT revoking existing sessions. The short-lived access
    # token still has role=PLAYER (<= 30 min), but as soon as the client
    # refreshes — either on schedule via the axios interceptor or when it
    # notices the /me response shows a new role — it will receive a new
    # token generated from the freshly updated ``target.role``. This avoids
    # kicking the user out mid-session just because we approved them.
    db.commit()
    db.refresh(target)
    return UserResponse(
        id=target.id,
        email=target.email,
        login=target.login,
        role=target.role.value,
        is_active=target.is_active,
        is_verified=target.is_verified,
        coach_application_status=target.coach_application_status.value,
    )


@router.post("/admin/coach-applications/{user_id}/reject", response_model=UserResponse)
def reject_coach_application(
    user_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reject a pending coach application."""
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Только администратор может отклонять заявки")
    target = db.query(AuthUser).filter(AuthUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.coach_application_status != CoachApplicationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Нет заявки в ожидании")
    target.coach_application_status = CoachApplicationStatus.REJECTED
    db.commit()
    db.refresh(target)
    return UserResponse(
        id=target.id,
        email=target.email,
        login=target.login,
        role=target.role.value,
        is_active=target.is_active,
        is_verified=target.is_verified,
        coach_application_status=target.coach_application_status.value,
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


# ---------- GET /auth/providers/steam ----------
@router.get("/providers/steam")
def get_linked_steam(current_user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the Steam provider id currently linked to the authed user, if any.

    Used by core to verify that a client-provided steam_id actually belongs
    to this user (i.e. was linked via the signed OpenID flow) before treating
    the linkage as trusted.
    """
    prov = db.query(AuthProvider).filter(
        AuthProvider.user_id == current_user.id,
        AuthProvider.provider == "STEAM",
    ).first()
    return {
        "linked": bool(prov),
        "steam_id": prov.provider_user_id if prov else None,
    }


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

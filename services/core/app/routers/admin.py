import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, require_role, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import (
    CoreUser, PlayerProfile, CoachProfile,
    TrainingRequest, TrainingSession, CoachReview,
    CoreActionLog,
)
from app.schemas import (
    AdminUserResponse, AdminPatchUser, AdminStatsResponse,
    ActionLogResponse, MessageResponse, AdminProfilesResponse, AdminProfileBrief,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Агрегированная статистика системы."""
    total_users = db.query(CoreUser).count()
    players = db.query(PlayerProfile).count()
    coaches = db.query(CoachProfile).count()

    active_requests = db.query(TrainingRequest).filter(
        TrainingRequest.status.notin_(["CANCELLED", "REJECTED"])
    ).count()
    total_sessions = db.query(TrainingSession).count()
    planned_sessions = db.query(TrainingSession).filter(TrainingSession.status == "PLANNED").count()
    completed_sessions = db.query(TrainingSession).filter(TrainingSession.status == "COMPLETED").count()
    cancelled_sessions = db.query(TrainingSession).filter(TrainingSession.status == "CANCELLED").count()

    avg_rating = db.query(sqlfunc.avg(CoachReview.rating)).scalar()
    avg_rating_val = round(float(avg_rating), 2) if avg_rating else None

    log_action(db, current_user.user_id, current_user.role, "VIEW_ADMIN_STATS",
               ip_address=request.client.host if request.client else None)

    return AdminStatsResponse(
        total_users=total_users,
        players=players,
        coaches=coaches,
        admins=0,
        active_requests=active_requests,
        total_sessions=total_sessions,
        planned_sessions=planned_sessions,
        completed_sessions=completed_sessions,
        cancelled_sessions=cancelled_sessions,
        avg_coach_rating=avg_rating_val,
    )


@router.get("/profiles", response_model=AdminProfilesResponse)
def admin_profiles(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Профили игроков и тренеров для админ-панели."""
    players_rows = db.query(PlayerProfile).order_by(PlayerProfile.id.desc()).all()
    coaches_rows = db.query(CoachProfile).order_by(CoachProfile.id.desc()).all()

    # Pre-index core_users → auth_user_id so we don't re-query per row.
    core_user_map = {cu.id: cu.auth_user_id for cu in db.query(CoreUser).all()}

    players = []
    for p in players_rows:
        sessions_total = db.query(sqlfunc.count(TrainingSession.id)).join(
            TrainingRequest, TrainingRequest.id == TrainingSession.training_request_id
        ).filter(TrainingRequest.player_profile_id == p.id).scalar() or 0
        sessions_completed = db.query(sqlfunc.count(TrainingSession.id)).join(
            TrainingRequest, TrainingRequest.id == TrainingSession.training_request_id
        ).filter(
            TrainingRequest.player_profile_id == p.id,
            TrainingSession.status == "COMPLETED",
        ).scalar() or 0
        players.append(AdminProfileBrief(
            id=p.id,
            core_user_id=p.core_user_id,
            auth_user_id=core_user_map.get(p.core_user_id),
            profile_type="PLAYER",
            rank_or_mmr=p.actual_rank_tier,
            roles=p.actual_roles,
            about=p.about,
            sessions_total=sessions_total,
            sessions_completed=sessions_completed,
        ))

    coaches = []
    for c in coaches_rows:
        sessions_total = db.query(sqlfunc.count(TrainingSession.id)).filter(
            TrainingSession.coach_profile_id == c.id
        ).scalar() or 0
        sessions_completed = db.query(sqlfunc.count(TrainingSession.id)).filter(
            TrainingSession.coach_profile_id == c.id,
            TrainingSession.status == "COMPLETED",
        ).scalar() or 0
        coaches.append(AdminProfileBrief(
            id=c.id,
            core_user_id=c.core_user_id,
            auth_user_id=core_user_map.get(c.core_user_id),
            profile_type="COACH",
            rank_or_mmr=str(c.mmr_estimate) if c.mmr_estimate is not None else c.rank_tier,
            roles=c.main_roles,
            about=c.about,
            sessions_total=sessions_total,
            sessions_completed=sessions_completed,
            is_verified=bool(c.is_verified),
        ))

    log_action(db, current_user.user_id, current_user.role, "VIEW_ADMIN_PROFILES",
               ip_address=request.client.host if request.client else None)
    return AdminProfilesResponse(players=players, coaches=coaches)


@router.get("/users", response_model=list[AdminUserResponse])
def admin_list_users(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Список пользователей."""
    users = db.query(CoreUser).order_by(CoreUser.id).all()

    log_action(db, current_user.user_id, current_user.role, "VIEW_ADMIN_USERS",
               ip_address=request.client.host if request.client else None)

    return [
        AdminUserResponse(
            id=u.id,
            auth_user_id=u.auth_user_id,
            role=None,
            email=None,
            login=None,
            is_active=None,
        )
        for u in users
    ]


@router.patch("/users/{user_id}", response_model=MessageResponse)
async def admin_patch_user(
    user_id: int,
    body: AdminPatchUser,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Обновление пользователя."""
    core_user = db.query(CoreUser).filter(CoreUser.id == user_id).first()
    if not core_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    log_action(db, current_user.user_id, current_user.role, "ADMIN_UPDATE_USER",
               "CORE_USER", user_id, {"role": body.role, "is_active": body.is_active})

    return MessageResponse(message=f"Пользователь {user_id} обновлён")


@router.get("/logs", response_model=list[ActionLogResponse])
def admin_logs(
    action_type: str = Query(None),
    core_user_id: int = Query(None),
    limit: int = Query(100, le=500),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Просмотр логов действий."""
    query = db.query(CoreActionLog)
    if action_type:
        query = query.filter(CoreActionLog.action_type == action_type)
    if core_user_id:
        query = query.filter(CoreActionLog.core_user_id == core_user_id)

    logs = query.order_by(CoreActionLog.created_at.desc()).limit(limit).all()
    return [
        ActionLogResponse(
            id=log.id,
            core_user_id=log.core_user_id,
            role=log.role,
            action_type=log.action_type,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/db-view/{table_name}")
def admin_db_view(
    table_name: str,
    request: Request,
    limit: int = Query(50, le=200),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Просмотр содержимого таблицы (read-only)."""
    allowed_tables = {
        "core_users": CoreUser,
        "player_profiles": PlayerProfile,
        "coach_profiles": CoachProfile,
        "training_requests": TrainingRequest,
        "training_sessions": TrainingSession,
        "coach_reviews": CoachReview,
    }

    if table_name not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Таблица недоступна. Доступные: {list(allowed_tables.keys())}")

    model = allowed_tables[table_name]
    rows = db.query(model).limit(limit).all()

    result = []
    for row in rows:
        row_dict = {}
        for col in row.__table__.columns:
            val = getattr(row, col.name)
            row_dict[col.name] = str(val) if val is not None else None
        result.append(row_dict)

    log_action(db, current_user.user_id, current_user.role, "VIEW_DB_TABLE",
               "TABLE", metadata={"table": table_name},
               ip_address=request.client.host if request.client else None)

    return {"table": table_name, "count": len(result), "rows": result}


# ---- ML Data Proxy (так admin фронт обращается к ML через core) ----

@router.get("/ml-data/stats")
async def admin_ml_data_stats(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Статистика ML-таблиц."""
    log_action(db, current_user.user_id, current_user.role, "VIEW_ML_DATA_STATS",
               ip_address=request.client.host if request.client else None)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/data/stats",
                headers=ml_headers(),
            )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/ml-data/table/{table_name}")
async def admin_ml_table(
    table_name: str,
    request: Request,
    limit: int = Query(50),
    offset: int = Query(0),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Просмотр ML-таблицы."""
    log_action(db, current_user.user_id, current_user.role, "VIEW_ML_TABLE",
               metadata={"table": table_name, "offset": offset},
               ip_address=request.client.host if request.client else None)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/data/table/{table_name}",
                params={"limit": limit, "offset": offset},
                headers=ml_headers(),
            )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/ml-data/baselines")
async def admin_ml_baselines(
    request: Request,
    mmr_band: str = Query(None),
    hero_id: int = Query(None),
    limit: int = Query(100),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Просмотр эталонов."""
    log_action(db, current_user.user_id, current_user.role, "VIEW_ML_BASELINES",
               metadata={"mmr_band": mmr_band, "hero_id": hero_id},
               ip_address=request.client.host if request.client else None)
    try:
        params = {"limit": limit}
        if mmr_band:
            params["mmr_band"] = mmr_band
        if hero_id:
            params["hero_id"] = hero_id
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/data/baselines",
                params=params,
                headers=ml_headers(),
            )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/ml-data/analyses")
async def admin_ml_analyses(
    request: Request,
    limit: int = Query(20),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Просмотр анализов игроков."""
    log_action(db, current_user.user_id, current_user.role, "VIEW_ML_ANALYSES",
               ip_address=request.client.host if request.client else None)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/data/analyses",
                params={"limit": limit},
                headers=ml_headers(),
            )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/ml-data/player-accounts")
async def admin_player_accounts(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Просмотр привязанных аккаунтов игроков."""
    log_action(db, current_user.user_id, current_user.role, "VIEW_PLAYER_ACCOUNTS",
               ip_address=request.client.host if request.client else None)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/data/player-accounts",
                headers=ml_headers(),
            )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/ml-data/player-account-detail/{account_id}")
async def admin_player_account_detail(
    account_id: int,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Детали аккаунта: профиль + матчи + анализ."""
    log_action(db, current_user.user_id, current_user.role, "VIEW_PLAYER_ACCOUNT_DETAIL",
               metadata={"account_id": account_id},
               ip_address=request.client.host if request.client else None)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/data/player-account-detail/{account_id}",
                headers=ml_headers(),
            )
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


@router.post("/ml-import", response_model=MessageResponse)
async def admin_ml_import(
    request: Request,
    directory_path: str = Query(..., description="Путь к директории с CSV"),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Запуск импорта данных ML."""
    log_action(db, current_user.user_id, current_user.role, "ML_IMPORT_START",
               metadata={"directory": directory_path},
               ip_address=request.client.host if request.client else None)
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/admin/load-kaggle-data",
                json={"directory_path": directory_path},
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            return MessageResponse(message=f"Импорт завершён: {resp.json()}")
        else:
            return MessageResponse(message=f"Ошибка импорта: {resp.text}")
    except Exception as e:
        return MessageResponse(message=f"Ошибка: {str(e)}")


# =============== Coach applications & verification ===============

@router.get("/coach-applications")
async def list_coach_applications(
    request: Request,
    status: str | None = Query(None, description="PENDING/APPROVED/REJECTED filter"),
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Proxy of auth `/admin/coach-applications` with the admin JWT forwarded."""
    token = request.headers.get("Authorization", "")
    params = {"status": status} if status else {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/coach-applications",
                headers={"Authorization": token},
                params=params,
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth недоступен: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.post("/coaches/{auth_user_id}/verify", response_model=MessageResponse)
async def verify_coach(
    auth_user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """One-button approval: flip role to COACH in auth and mark the core
    CoachProfile as verified so the user appears in the catalog."""
    token = request.headers.get("Authorization", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/coach-applications/{auth_user_id}/approve",
                headers={"Authorization": token},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth недоступен: {exc}")
    if resp.status_code not in (200, 400):
        # 400 = no pending application; we still allow verifying the profile
        # if one exists, so the admin can re-verify without re-applying.
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    core_user = db.query(CoreUser).filter(CoreUser.auth_user_id == auth_user_id).first()
    if not core_user:
        core_user = CoreUser(auth_user_id=auth_user_id)
        db.add(core_user)
        db.flush()
    profile = db.query(CoachProfile).filter(CoachProfile.core_user_id == core_user.id).first()
    if not profile:
        profile = CoachProfile(core_user_id=core_user.id, is_verified=True)
        db.add(profile)
    else:
        profile.is_verified = True
    db.commit()

    log_action(
        db, current_user.user_id, current_user.role, "VERIFY_COACH",
        "COACH_PROFILE", profile.id, {"auth_user_id": auth_user_id},
        ip_address=request.client.host if request.client else None,
    )
    return MessageResponse(message="Тренер подтверждён")


@router.post("/coaches/{auth_user_id}/reject", response_model=MessageResponse)
async def reject_coach(
    auth_user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Reject a pending coach application (leaves role=PLAYER, no CoachProfile)."""
    token = request.headers.get("Authorization", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/coach-applications/{auth_user_id}/reject",
                headers={"Authorization": token},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth недоступен: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    log_action(
        db, current_user.user_id, current_user.role, "REJECT_COACH",
        "AUTH_USER", auth_user_id,
        ip_address=request.client.host if request.client else None,
    )
    return MessageResponse(message="Заявка на тренера отклонена")


@router.post("/backfill/players", response_model=MessageResponse)
async def backfill_players(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """One-shot backfill: for every PlayerProfile with a linked Steam account,
    re-run the ML link pipeline so ``lifetime_games``, ``parsed_games_n``,
    ranked-only summaries and percentile scores are all computed with the
    latest code.

    The actual heavy work is kicked into the ML deep-sync background queue,
    so the endpoint returns immediately with a count of scheduled jobs.
    """
    profiles = db.query(PlayerProfile).filter(
        PlayerProfile.dota_account_id.isnot(None),
        PlayerProfile.steam_id.isnot(None),
    ).all()

    scheduled = 0
    failures: list[str] = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for p in profiles:
            try:
                resp = await client.post(
                    f"{settings.ML_SERVICE_URL}/ml/refresh-player-data/{p.dota_account_id}",
                    headers=ml_headers(),
                )
                if resp.status_code == 200:
                    scheduled += 1
                else:
                    failures.append(f"#{p.id}: HTTP {resp.status_code}")
            except httpx.RequestError as exc:
                failures.append(f"#{p.id}: {exc}")

    log_action(
        db, current_user.user_id, current_user.role, "BACKFILL_PLAYERS",
        metadata={"scheduled": scheduled, "failures": len(failures)},
        ip_address=request.client.host if request.client else None,
    )
    msg = f"Запущено повторная синхронизация: {scheduled} игроков"
    if failures:
        msg += f"; ошибки: {len(failures)} (первые 3: {failures[:3]})"
    return MessageResponse(message=msg)


@router.post("/coaches/{auth_user_id}/unverify", response_model=MessageResponse)
async def unverify_coach(
    auth_user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Remove a coach from the public catalog without revoking the role.

    Useful when a coach goes inactive or fails a quality check. They retain
    access to their own dashboard but stop appearing in /coaches.
    """
    core_user = db.query(CoreUser).filter(CoreUser.auth_user_id == auth_user_id).first()
    if not core_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    profile = db.query(CoachProfile).filter(CoachProfile.core_user_id == core_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль тренера не найден")
    profile.is_verified = False
    db.commit()
    log_action(
        db, current_user.user_id, current_user.role, "UNVERIFY_COACH",
        "COACH_PROFILE", profile.id,
        ip_address=request.client.host if request.client else None,
    )
    return MessageResponse(message="Тренер скрыт из каталога")

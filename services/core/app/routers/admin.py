import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, require_role, log_action
from app.config import settings
from app.models import (
    CoreUser, PlayerProfile, CoachProfile,
    TrainingRequest, TrainingSession, CoachReview,
    CoreActionLog,
)
from app.schemas import (
    AdminUserResponse, AdminPatchUser, AdminStatsResponse,
    ActionLogResponse, MessageResponse,
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
        avg_coach_rating=avg_rating_val,
    )


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
            resp = await client.get(f"{settings.ML_SERVICE_URL}/ml/data/stats")
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
            resp = await client.get(f"{settings.ML_SERVICE_URL}/ml/data/baselines", params=params)
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
            resp = await client.get(f"{settings.ML_SERVICE_URL}/ml/data/analyses", params={"limit": limit})
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
            resp = await client.get(f"{settings.ML_SERVICE_URL}/ml/data/player-accounts")
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
            resp = await client.get(f"{settings.ML_SERVICE_URL}/ml/data/player-account-detail/{account_id}")
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
            )
        if resp.status_code == 200:
            return MessageResponse(message=f"Импорт завершён: {resp.json()}")
        else:
            return MessageResponse(message=f"Ошибка импорта: {resp.text}")
    except Exception as e:
        return MessageResponse(message=f"Ошибка: {str(e)}")

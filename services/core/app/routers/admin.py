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


@router.get("/users-full")
async def admin_users_full(
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Return a single row per registered user, enriched with everything
    admins need to see at a glance.

    Columns joined:
    * auth (login, email, role, coach_application_status, Steam provider)
    * core (PlayerProfile.id, desired_rank_tier, dota_account_id)
    * core (CoachProfile.id, is_verified, hourly_rate, mmr_estimate)
    * ml   (personaname, rank_tier, lifetime_games from player_accounts)

    One row per ``auth_user`` even if they never opened a protected core page.
    """
    token = request.headers.get("Authorization", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/users-lite",
                headers={"Authorization": token},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth недоступен: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    auth_users = resp.json().get("items", [])

    # Index core-side profiles by auth_user_id for a single pass.
    core_user_map = {cu.auth_user_id: cu for cu in db.query(CoreUser).all()}
    player_profiles = {
        pp.core_user_id: pp for pp in db.query(PlayerProfile).all()
    }
    coach_profiles = {
        cp.core_user_id: cp for cp in db.query(CoachProfile).all()
    }

    # Pull ML personaname/rank/lifetime by account_id. We only need a
    # lightweight projection, so go through the ORM rather than a JOIN.
    from app.models import TrainingSession as _TS, TrainingRequest as _TR
    from sqlalchemy import text as _sql_text

    STEAM_ID_BASE_FOR_IDS = 76561197960265728

    def _compute_account_id(steam_id_val):
        try:
            sid = int(str(steam_id_val))
            return sid - STEAM_ID_BASE_FOR_IDS if sid > STEAM_ID_BASE_FOR_IDS else sid
        except (TypeError, ValueError):
            return None

    dota_account_ids = set()
    for pp in player_profiles.values():
        if pp.dota_account_id and str(pp.dota_account_id).isdigit():
            dota_account_ids.add(int(pp.dota_account_id))
    # Also include account_ids derived from Steam providers (even if no
    # PlayerProfile yet) so admins see all possible accounts in ml_map.
    for u in auth_users:
        if u.get("steam_id"):
            aid = _compute_account_id(u["steam_id"])
            if aid is not None:
                dota_account_ids.add(aid)
    dota_account_ids = list(dota_account_ids)
    ml_map: dict[int, dict] = {}
    if dota_account_ids:
        rows = db.execute(
            _sql_text(
                "SELECT account_id, personaname, rank_tier, "
                "       COALESCE(lifetime_games, COALESCE(win,0) + COALESCE(lose,0)) AS lifetime_games, "
                "       parsed_games_n "
                "FROM player_accounts WHERE account_id = ANY(:ids)"
            ),
            {"ids": dota_account_ids},
        )
        for row in rows.mappings():
            ml_map[int(row["account_id"])] = dict(row)

    def rank_name(rt):
        if not rt:
            return None
        medals = {1: "Herald", 2: "Guardian", 3: "Crusader", 4: "Archon",
                  5: "Legend", 6: "Ancient", 7: "Divine", 8: "Immortal"}
        medal = int(rt) // 10
        stars = int(rt) % 10
        base = medals.get(medal, "?")
        return f"{base} [{stars}]" if stars else base

    # Session counts per coach/player profile for quick stats.
    session_by_coach = {
        r[0]: r[1] for r in db.execute(_sql_text(
            "SELECT coach_profile_id, COUNT(*) FROM training_sessions GROUP BY coach_profile_id"
        ))
    }
    session_by_player = {}
    for r in db.execute(_sql_text(
        "SELECT tr.player_profile_id, COUNT(*) "
        "FROM training_sessions ts JOIN training_requests tr ON tr.id = ts.training_request_id "
        "GROUP BY tr.player_profile_id"
    )):
        session_by_player[r[0]] = r[1]

    STEAM_ID_BASE = 76561197960265728

    def _acc_id_from_steam(steam_id_str):
        try:
            sid = int(str(steam_id_str))
            return sid - STEAM_ID_BASE if sid > STEAM_ID_BASE else sid
        except (TypeError, ValueError):
            return None

    items = []
    for u in auth_users:
        core_user = core_user_map.get(u["id"])
        pp = player_profiles.get(core_user.id) if core_user else None
        cp = coach_profiles.get(core_user.id) if core_user else None

        # dota_account_id is often missing for profiles where OpenDota never
        # returned a public profile. It is still mathematically derivable
        # from the Steam link we hold in auth_providers. Compute on the fly
        # so the admin "Догрузить" button always has a target.
        effective_account_id = None
        if pp and pp.dota_account_id and str(pp.dota_account_id).isdigit():
            effective_account_id = int(pp.dota_account_id)
        elif u.get("steam_id"):
            effective_account_id = _acc_id_from_steam(u["steam_id"])

        ml_row = None
        if effective_account_id is not None:
            ml_row = ml_map.get(effective_account_id)

        items.append({
            "auth_user_id": u["id"],
            "login": u["login"],
            "email": u["email"],
            "role": u["role"],
            "is_active": u["is_active"],
            "is_verified": u["is_verified"],
            "coach_application_status": u["coach_application_status"],
            "coach_application_requested_at": u["coach_application_requested_at"],
            "created_at": u["created_at"],
            # Steam / linking
            "steam_id": u.get("steam_id"),
            "steam_id_in_profile": pp.steam_id if pp else None,
            "steam_linked": bool(u.get("steam_id")),
            "dota_account_id": pp.dota_account_id if pp and pp.dota_account_id else (
                str(effective_account_id) if effective_account_id is not None else None
            ),
            # Pulled from ML player_accounts.
            "dota_personaname": (ml_row or {}).get("personaname"),
            "dota_rank_tier": (ml_row or {}).get("rank_tier"),
            "dota_rank_name": rank_name((ml_row or {}).get("rank_tier")),
            "lifetime_games": (ml_row or {}).get("lifetime_games"),
            "parsed_games_n": (ml_row or {}).get("parsed_games_n"),
            # Core profile presence.
            "core_user_id": core_user.id if core_user else None,
            "player_profile_id": pp.id if pp else None,
            "player_desired_rank": pp.desired_rank_tier if pp else None,
            "player_actual_rank": pp.actual_rank_tier if pp else None,
            "coach_profile_id": cp.id if cp else None,
            "coach_is_verified": bool(cp.is_verified) if cp else None,
            "coach_hourly_rate": cp.hourly_rate if cp else None,
            "coach_mmr_estimate": cp.mmr_estimate if cp else None,
            # Activity.
            "sessions_as_player": session_by_player.get(pp.id, 0) if pp else 0,
            "sessions_as_coach": session_by_coach.get(cp.id, 0) if cp else 0,
        })

    log_action(
        db, current_user.user_id, current_user.role, "VIEW_ADMIN_USERS_FULL",
        metadata={"count": len(items)},
        ip_address=request.client.host if request.client else None,
    )
    return {"items": items}


@router.get("/users/{auth_user_id}/detail")
async def admin_user_detail(
    auth_user_id: int,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Full admin-side dossier for a single registered user.

    Aggregates:
    * auth side: login/email/role/active flag/consent version/Steam provider
    * core profiles: PlayerProfile and CoachProfile (+ sessions history)
    * Steam Web API: whether we were able to reach Valve for this SteamID,
      persona/avatar/visibility, Dota 2 playtime
    * OpenDota: did we get a public Dota profile, ``fh_unavailable`` flag
      (i.e. "Expose Public Match Data" off), rank, lifetime/parsed games,
      latest ML analysis summary

    Everything is read from local DB where possible; a live Steam Web API
    call is made only when the user has a Steam link, so refreshing the
    page doesn't spam Valve.
    """
    STEAM_ID_BASE = 76561197960265728

    token = request.headers.get("Authorization", "")
    # auth user
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/users-lite",
                headers={"Authorization": token},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth недоступен: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    auth_user = next((u for u in resp.json().get("items", []) if u["id"] == auth_user_id), None)
    if not auth_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    core_user = db.query(CoreUser).filter(CoreUser.auth_user_id == auth_user_id).first()
    player_profile = (
        db.query(PlayerProfile).filter(PlayerProfile.core_user_id == core_user.id).first()
        if core_user else None
    )
    coach_profile = (
        db.query(CoachProfile).filter(CoachProfile.core_user_id == core_user.id).first()
        if core_user else None
    )

    # Derive Dota account_id from Steam even if we never wrote it to
    # player_profile (OpenDota may have refused).
    account_id = None
    if player_profile and player_profile.dota_account_id and str(player_profile.dota_account_id).isdigit():
        account_id = int(player_profile.dota_account_id)
    elif auth_user.get("steam_id"):
        try:
            sid = int(auth_user["steam_id"])
            account_id = sid - STEAM_ID_BASE if sid > STEAM_ID_BASE else sid
        except (TypeError, ValueError):
            account_id = None

    # ML row (persona, rank, lifetime_games, playtime, fetched_at)
    ml_row = None
    ml_analysis = None
    if account_id is not None:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/player-account/{account_id}",
                    headers=ml_headers(),
                )
            if r.status_code == 200:
                ml_row = r.json()
        except httpx.RequestError:
            pass
        if player_profile and player_profile.ml_analysis_id:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    r = await client.get(
                        f"{settings.ML_SERVICE_URL}/ml/player-analysis/{player_profile.ml_analysis_id}",
                        headers=ml_headers(),
                    )
                if r.status_code == 200:
                    ml_analysis = r.json()
            except httpx.RequestError:
                pass

    # Live Steam Web API probe — tells us whether Steam Web API key is
    # configured and whether the user has visibility set up.
    steam_web = None
    if auth_user.get("steam_id"):
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/debug/steam-web/{auth_user['steam_id']}",
                    headers=ml_headers(),
                )
            if r.status_code == 200:
                steam_web = r.json()
        except httpx.RequestError:
            pass

    # Sessions: as player (through training_requests) and as coach.
    from sqlalchemy import text as _sql_text
    sessions_as_player = []
    sessions_as_coach = []
    if player_profile:
        rows = db.execute(_sql_text(
            "SELECT ts.id, ts.status::text AS status, ts.scheduled_at, ts.coach_profile_id "
            "FROM training_sessions ts "
            "JOIN training_requests tr ON tr.id = ts.training_request_id "
            "WHERE tr.player_profile_id = :pid "
            "ORDER BY ts.scheduled_at DESC NULLS LAST LIMIT 10"
        ), {"pid": player_profile.id})
        for r in rows.mappings():
            sessions_as_player.append({
                "id": r["id"],
                "status": r["status"],
                "scheduled_at": r["scheduled_at"].isoformat() if r["scheduled_at"] else None,
                "coach_profile_id": r["coach_profile_id"],
            })
    if coach_profile:
        rows = db.execute(_sql_text(
            "SELECT id, status::text AS status, scheduled_at, training_request_id "
            "FROM training_sessions WHERE coach_profile_id = :cid "
            "ORDER BY scheduled_at DESC NULLS LAST LIMIT 10"
        ), {"cid": coach_profile.id})
        for r in rows.mappings():
            sessions_as_coach.append({
                "id": r["id"],
                "status": r["status"],
                "scheduled_at": r["scheduled_at"].isoformat() if r["scheduled_at"] else None,
                "training_request_id": r["training_request_id"],
            })

    # Derive "status" of each source of data — what admin really wants to see.
    steam_linked = bool(auth_user.get("steam_id"))
    steam_web_available = bool(steam_web and steam_web.get("configured") and steam_web.get("found"))
    opendota_available = bool(ml_row and (ml_row.get("personaname") or ml_row.get("rank_tier")))
    # fh_unavailable is OpenDota's signal that Dota match history is closed.
    match_history_open = bool(
        opendota_available and not ml_row.get("error") and (
            (ml_row.get("lifetime_games") or 0) > 0
            or (ml_row.get("matches_loaded") or 0) > 0
        )
    )

    log_action(
        db, current_user.user_id, current_user.role, "VIEW_ADMIN_USER_DETAIL",
        "AUTH_USER", auth_user_id,
        ip_address=request.client.host if request.client else None,
    )

    return {
        "auth": auth_user,
        "core_user_id": core_user.id if core_user else None,
        "account_id": account_id,
        "player_profile": {
            "id": player_profile.id,
            "steam_id": player_profile.steam_id,
            "dota_account_id": player_profile.dota_account_id,
            "actual_rank_tier": player_profile.actual_rank_tier,
            "desired_rank_tier": player_profile.desired_rank_tier,
            "actual_roles": player_profile.actual_roles,
            "desired_roles": player_profile.desired_roles,
            "training_goals": player_profile.training_goals,
            "ml_analysis_id": player_profile.ml_analysis_id,
        } if player_profile else None,
        "coach_profile": {
            "id": coach_profile.id,
            "is_verified": bool(coach_profile.is_verified),
            "mmr_estimate": coach_profile.mmr_estimate,
            "rank_tier": coach_profile.rank_tier,
            "main_roles": coach_profile.main_roles,
            "hero_pool": coach_profile.hero_pool,
            "hourly_rate": coach_profile.hourly_rate,
            "experience_years": coach_profile.experience_years,
            "about": coach_profile.about,
        } if coach_profile else None,
        "steam": {
            "linked": steam_linked,
            "steam_id": auth_user.get("steam_id"),
            "web_api_configured": bool(steam_web and steam_web.get("configured")),
            "web_api_found": bool(steam_web and steam_web.get("found")),
            "profile": (steam_web or {}).get("profile"),
            "playtime": (steam_web or {}).get("playtime"),
        },
        "opendota": {
            "available": opendota_available,
            "match_history_open": match_history_open,
            "warning": (ml_row or {}).get("warning"),
            "personaname": (ml_row or {}).get("personaname"),
            "avatar_url": (ml_row or {}).get("avatar_url"),
            "rank_tier": (ml_row or {}).get("rank_tier"),
            "mmr_estimate": (ml_row or {}).get("mmr_estimate"),
            "win": (ml_row or {}).get("win"),
            "lose": (ml_row or {}).get("lose"),
            "lifetime_games": (ml_row or {}).get("lifetime_games"),
            "parsed_games_n": (ml_row or {}).get("parsed_games_n"),
            "estimated_hours": (ml_row or {}).get("estimated_hours"),
            "last_match_time": (ml_row or {}).get("last_match_time"),
            "matches_loaded": (ml_row or {}).get("matches_loaded"),
        },
        "analysis": {
            "analysis_id": (ml_analysis or {}).get("ml_analysis_id"),
            "summary": (ml_analysis or {}).get("summary"),
            "weaknesses_ranked": (ml_analysis or {}).get("weaknesses_ranked"),
            "strengths_ranked": (ml_analysis or {}).get("strengths_ranked"),
        } if ml_analysis else None,
        "sessions_as_player": sessions_as_player,
        "sessions_as_coach": sessions_as_coach,
    }


@router.post("/users/{auth_user_id}/role", response_model=MessageResponse)
async def admin_change_role(
    auth_user_id: int,
    body: dict,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Change a user's role via auth, then keep core profiles consistent.

    * Promoting to ``COACH`` → auto-create a ``CoachProfile`` with
      ``is_verified=True`` so they appear in the catalog.
    * Demoting from ``COACH`` → mark the coach profile as unverified so
      they stop showing up, but keep the row for historical stats.
    """
    new_role = str(body.get("role", "")).upper()
    if new_role not in ("PLAYER", "COACH", "ADMIN"):
        raise HTTPException(status_code=400, detail="role must be PLAYER, COACH or ADMIN")

    token = request.headers.get("Authorization", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.AUTH_SERVICE_URL}/auth/admin/users/{auth_user_id}/role",
                json={"role": new_role},
                headers={"Authorization": token},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth недоступен: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    core_user = db.query(CoreUser).filter(CoreUser.auth_user_id == auth_user_id).first()
    if core_user:
        coach = db.query(CoachProfile).filter(CoachProfile.core_user_id == core_user.id).first()
        if new_role == "COACH":
            if not coach:
                coach = CoachProfile(core_user_id=core_user.id, is_verified=True)
                db.add(coach)
            else:
                coach.is_verified = True
            db.commit()
        elif new_role in ("PLAYER", "ADMIN") and coach and coach.is_verified:
            coach.is_verified = False
            db.commit()

    log_action(
        db, current_user.user_id, current_user.role, "CHANGE_ROLE",
        "AUTH_USER", auth_user_id, {"new_role": new_role},
        ip_address=request.client.host if request.client else None,
    )
    return MessageResponse(message=f"Роль пользователя #{auth_user_id} → {new_role}")


@router.post("/steam/{account_id}/refresh", response_model=MessageResponse)
async def admin_refresh_steam_account(
    account_id: int,
    request: Request,
    current_user: CurrentUser = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    """Manually kick a fresh deep-sync for one Steam/Dota account. Used by
    the admin UI to force a re-download for accounts whose data hasn't
    been pulled yet (closed profiles, earlier rate-limit, etc.)."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/refresh-player-data/{account_id}",
                headers=ml_headers(),
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"ML недоступен: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    log_action(
        db, current_user.user_id, current_user.role, "ADMIN_REFRESH_STEAM",
        metadata={"account_id": account_id, "ml_status": resp.status_code},
        ip_address=request.client.host if request.client else None,
    )
    msg = "Запрошена фоновая загрузка данных."
    if isinstance(data, dict) and data.get("parse_message"):
        msg = str(data["parse_message"])[:160]
    return MessageResponse(message=msg)


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

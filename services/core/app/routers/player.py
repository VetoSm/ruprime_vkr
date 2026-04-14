import httpx
from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.models import PlayerProfile
from app.schemas import PlayerProfileUpdate, PlayerProfileResponse

router = APIRouter(prefix="/player", tags=["player"])


class LinkSteamInput(BaseModel):
    steam_id: str


class SteamAccountData(BaseModel):
    account_id: Optional[int] = None
    steam_id: Optional[str] = None
    personaname: Optional[str] = None
    avatar_url: Optional[str] = None
    rank_tier: Optional[int] = None
    mmr_estimate: Optional[int] = None
    win: Optional[int] = None
    lose: Optional[int] = None
    total_games: Optional[int] = None
    totals: Optional[dict] = None
    estimated_hours: Optional[float] = None
    last_match_time: Optional[str] = None
    profile_url: Optional[str] = None
    is_public: Optional[bool] = None
    matches_loaded: int = 0
    roles_distribution: Optional[dict] = None
    recent_matches: Optional[list] = None
    heroes_top: Optional[list] = None
    rankings_top: Optional[list] = None
    error: Optional[str] = None
    warning: Optional[str] = None
    parse_requested: int = 0
    parse_message: Optional[str] = None


@router.get("/profile", response_model=PlayerProfileResponse)
def get_player_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Получить профиль текущего игрока."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль игрока не найден. Создайте профиль.")
    return profile


@router.post("/profile", response_model=PlayerProfileResponse)
def create_or_update_player_profile(
    body: PlayerProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Создать или обновить профиль игрока (желаемые данные)."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    if not profile:
        profile = PlayerProfile(core_user_id=current_user.user_id)
        db.add(profile)

    if body.desired_rank_tier is not None:
        profile.desired_rank_tier = body.desired_rank_tier
    if body.desired_roles is not None:
        profile.desired_roles = body.desired_roles
    if body.training_goals is not None:
        profile.training_goals = body.training_goals
    if body.about is not None:
        profile.about = body.about

    db.commit()
    db.refresh(profile)

    log_action(db, current_user.user_id, current_user.role, "UPDATE_PLAYER_PROFILE",
               "PLAYER_PROFILE", profile.id)

    return profile


@router.post("/link-steam", response_model=SteamAccountData)
async def link_steam(
    body: LinkSteamInput,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Привязка Steam аккаунта:
    1. Сохраняет провайдер в Auth
    2. Загружает данные из OpenDota через ML
    3. Обновляет PlayerProfile
    """
    steam_id = body.steam_id.strip()
    if not steam_id or not steam_id.isdigit():
        raise HTTPException(status_code=400, detail="Некорректный Steam ID. Введите числовой SteamID64.")

    # 1. Link in Auth service
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token = request.headers.get("Authorization", "")
            resp = await client.post(
                f"{settings.AUTH_SERVICE_URL}/auth/link-steam",
                json={"steam_token": steam_id},
                headers={"Authorization": token},
            )
        if resp.status_code not in (200, 409):
            raise HTTPException(status_code=resp.status_code, detail=f"Auth ошибка: {resp.text}")
    except httpx.RequestError:
        pass  # Auth may be unavailable, continue with ML

    # 2. Fetch data from OpenDota via ML service
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/link-steam-account",
                json={"steam_id": steam_id},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"ML сервис ошибка: {resp.text}")

        data = resp.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"ML сервис недоступен: {str(e)}")

    if data.get("error"):
        return SteamAccountData(**data)

    # 3. Update PlayerProfile with fetched data
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    if not profile:
        profile = PlayerProfile(core_user_id=current_user.user_id)
        db.add(profile)

    profile.steam_id = steam_id
    profile.dota_account_id = str(data.get("account_id", ""))

    # Update actual rank from OpenDota rank_tier
    rank_tier = data.get("rank_tier")
    if rank_tier:
        medal = rank_tier // 10
        rank_names = {1: "HERALD", 2: "GUARDIAN", 3: "CRUSADER", 4: "ARCHON",
                      5: "LEGEND", 6: "ANCIENT", 7: "DIVINE", 8: "IMMORTAL"}
        stars = rank_tier % 10
        profile.actual_rank_tier = f"{rank_names.get(medal, 'UNKNOWN')} [{stars}]"

    db.commit()
    db.refresh(profile)

    # Auto-trigger analysis if matches were loaded
    if data.get("matches_count", 0) > 0:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/analyze-player/{data['account_id']}",
                    params={"player_profile_id": profile.id},
                )
            if resp.status_code == 200:
                analysis = resp.json()
                if analysis.get("ml_analysis_id"):
                    profile.ml_analysis_id = analysis["ml_analysis_id"]
                    db.commit()
        except Exception:
            pass

    log_action(db, current_user.user_id, current_user.role, "LINK_STEAM",
               "PLAYER_PROFILE", profile.id,
               {"steam_id": steam_id, "account_id": data.get("account_id"), "personaname": data.get("personaname")},
               ip_address=request.client.host if request.client else None)

    return SteamAccountData(**data)


@router.post("/sync-steam", response_model=SteamAccountData)
async def sync_steam(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Полная синхронизация Steam-данных для уже привязанного аккаунта:
    - обновляет профиль/матчи из OpenDota через ML
    - обновляет PlayerProfile в Core
    - переиспользует тот же формат ответа, что и link-steam
    """
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    if not profile or not profile.steam_id:
        raise HTTPException(status_code=400, detail="Сначала привяжите Steam аккаунт")

    steam_id = profile.steam_id.strip()
    if not steam_id or not steam_id.isdigit():
        raise HTTPException(status_code=400, detail="Некорректный Steam ID в профиле. Перепривяжите аккаунт.")

    # Refresh data in ML (same pipeline as link-steam)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/link-steam-account",
                json={"steam_id": steam_id},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"ML сервис ошибка: {resp.text}")
        data = resp.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"ML сервис недоступен: {str(e)}")

    if data.get("error"):
        return SteamAccountData(**data)

    profile.dota_account_id = str(data.get("account_id", ""))
    rank_tier = data.get("rank_tier")
    if rank_tier:
        medal = rank_tier // 10
        rank_names = {1: "HERALD", 2: "GUARDIAN", 3: "CRUSADER", 4: "ARCHON",
                      5: "LEGEND", 6: "ANCIENT", 7: "DIVINE", 8: "IMMORTAL"}
        stars = rank_tier % 10
        profile.actual_rank_tier = f"{rank_names.get(medal, 'UNKNOWN')} [{stars}]"

    db.commit()
    db.refresh(profile)

    if data.get("matches_count", 0) > 0:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/analyze-player/{data['account_id']}",
                    params={"player_profile_id": profile.id},
                )
            if resp.status_code == 200:
                analysis = resp.json()
                if analysis.get("ml_analysis_id"):
                    profile.ml_analysis_id = analysis["ml_analysis_id"]
                    db.commit()
        except Exception:
            pass

    log_action(
        db,
        current_user.user_id,
        current_user.role,
        "SYNC_STEAM",
        "PLAYER_PROFILE",
        profile.id,
        {"steam_id": steam_id, "account_id": data.get("account_id"), "personaname": data.get("personaname")},
        ip_address=request.client.host if request.client else None,
    )

    return SteamAccountData(**data)


@router.post("/refresh-steam")
async def refresh_steam(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Обновить данные Steam аккаунта."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    if not profile or not profile.dota_account_id:
        raise HTTPException(status_code=400, detail="Сначала привяжите Steam аккаунт")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/refresh-player-data/{profile.dota_account_id}",
            )
        if resp.status_code == 200:
            data = resp.json()
            log_action(db, current_user.user_id, current_user.role, "REFRESH_STEAM",
                       "PLAYER_PROFILE", profile.id)
            return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/steam-data")
async def get_steam_data(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Получить сохранённые данные Steam аккаунта."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    if not profile or not profile.dota_account_id:
        return {"linked": False}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/player-account/{profile.dota_account_id}",
            )
        if resp.status_code == 200:
            data = resp.json()
            data["linked"] = True
            return data
    except Exception:
        pass

    return {"linked": True, "account_id": profile.dota_account_id, "steam_id": profile.steam_id}

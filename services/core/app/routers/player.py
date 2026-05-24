import httpx
from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import PlayerProfile
from app.schemas import PlayerProfileUpdate, PlayerProfileResponse

router = APIRouter(prefix="/player", tags=["player"])


class LinkSteamInput(BaseModel):
    steam_id: str
    # `trusted=True` means this call is a continuation of a successful
    # Steam OpenID link flow (cookie-signed; frontend received #linked=1).
    # In that case we skip the separate /auth/link-steam stub and trust the
    # AuthProvider row that was already written by the OpenID callback.
    trusted: bool = False


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
    lifetime_games: Optional[int] = None
    parsed_games_n: Optional[int] = None
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
    if body.analysis_role is not None:
        role = body.analysis_role.strip().upper() if body.analysis_role else ""
        if role and role not in ("POS1", "POS2", "POS3", "POS4", "POS5"):
            raise HTTPException(status_code=400, detail="analysis_role must be POS1..POS5")
        profile.analysis_role = role or None
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

    # Security policy for linking Steam:
    #
    #   * Preferred path — the user comes from the Steam OpenID callback which
    #     already wrote the AuthProvider row. Frontend sets `trusted=True` in
    #     this case. We verify by asking auth what Steam id is actually linked
    #     to this user, and only proceed when they match.
    #
    #   * Fallback "manual" path — user pastes a SteamID64. We call the old
    #     auth.link-steam stub which enforces uniqueness (no two users can
    #     claim the same id). The binding is NOT cryptographically proven to
    #     belong to the caller, so the manual UI must warn the user.
    token = request.headers.get("Authorization", "")

    if body.trusted:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{settings.AUTH_SERVICE_URL}/auth/providers/steam",
                    headers={"Authorization": token},
                )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Auth недоступен")
            data = resp.json()
            if not data.get("linked") or data.get("steam_id") != steam_id:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Привязка Steam не подтверждена. Запустите привязку заново "
                        "через кнопку «Привязать Steam»."
                    ),
                )
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Auth недоступен")
    else:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{settings.AUTH_SERVICE_URL}/auth/link-steam",
                    json={"steam_token": steam_id},
                    headers={"Authorization": token},
                )
            if resp.status_code == 409:
                raise HTTPException(
                    status_code=409,
                    detail="Этот Steam ID уже привязан к другому аккаунту",
                )
            if resp.status_code not in (200, 409):
                raise HTTPException(status_code=resp.status_code, detail=f"Auth ошибка: {resp.text}")
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Auth недоступен")

    # 2. Fetch data from OpenDota via ML service
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/link-steam-account",
                json={"steam_id": steam_id},
                headers=ml_headers(),
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

    # Any sync changes the match window and parsed fields; invalidate the old
    # cached analysis so dashboards/AI recompute with the latest feature logic.
    profile.ml_analysis_id = None
    db.commit()

    # Auto-trigger analysis if matches were loaded
    if data.get("matches_loaded", data.get("matches_count", 0)) > 0:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/analyze-player/{data['account_id']}",
                    params={"player_profile_id": profile.id, "mode": "ranked", "period": "50"},
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                resp.json()
        except Exception:
            pass

    log_action(
        db, current_user.user_id, current_user.role, "LINK_STEAM",
        "PLAYER_PROFILE", profile.id,
        {
            "steam_id": steam_id,
            "account_id": data.get("account_id"),
            "personaname": data.get("personaname"),
            "method": "openid_trusted" if body.trusted else "manual",
        },
        ip_address=request.client.host if request.client else None,
    )

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

    # Force-refresh data in ML when we already know account_id. The link
    # endpoint intentionally returns cached data for existing accounts and only
    # queues background sync; the user's "Обновить данные" action must pull a
    # fresh OpenDota snapshot immediately.
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if profile.dota_account_id:
                resp = await client.post(
                    f"{settings.ML_SERVICE_URL}/ml/refresh-player-data/{profile.dota_account_id}",
                    headers=ml_headers(),
                )
            else:
                resp = await client.post(
                    f"{settings.ML_SERVICE_URL}/ml/link-steam-account",
                    json={"steam_id": steam_id},
                    headers=ml_headers(),
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

    profile.ml_analysis_id = None
    db.commit()

    if data.get("matches_loaded", data.get("matches_count", 0)) > 0:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/analyze-player/{data['account_id']}",
                    params={"player_profile_id": profile.id, "mode": "ranked", "period": "50"},
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                resp.json()
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
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            data = resp.json()
            profile.ml_analysis_id = None
            db.commit()
            log_action(db, current_user.user_id, current_user.role, "REFRESH_STEAM",
                       "PLAYER_PROFILE", profile.id)
            return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/sync-status")
async def player_sync_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the background deep-sync job state for the current player.

    Used by the dashboard to render the "загружаем данные" progress card so
    the user sees how many matches have been fetched since they linked
    Steam. Returns ``{"scheduled": false}`` when there is no linked account.
    """
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile or not profile.dota_account_id:
        return {"scheduled": False}

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/player-sync-status/{profile.dota_account_id}",
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            data = resp.json() or {}
            data["scheduled"] = True
            return data
    except httpx.RequestError:
        pass
    return {"scheduled": False}


def _owned_match_account_id(
    db: Session, current_user: CurrentUser, match_id: int
) -> int:
    """Confirm ``match_id`` is in the current player's match history.

    ``player_matches`` lives in the shared DB (written by ML), so core
    can probe it directly via raw SQL without owning the model.
    """
    from sqlalchemy import text

    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile or not profile.dota_account_id:
        raise HTTPException(status_code=400, detail="Сначала привяжите Steam аккаунт")
    try:
        account_id = int(profile.dota_account_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Некорректный dota_account_id в профиле")

    row = db.execute(
        text("SELECT 1 FROM player_matches WHERE account_id = :acc AND match_id = :mid LIMIT 1"),
        {"acc": account_id, "mid": match_id},
    ).first()
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Этот матч не найден в истории вашего аккаунта",
        )
    return account_id


@router.get("/parse-progress")
async def get_parse_progress(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Сколько из последних ~200 матчей уже распарсено."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile or not profile.dota_account_id:
        return {"linked": False}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/parse-progress/{profile.dota_account_id}",
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            data = resp.json()
            data["linked"] = True
            return data
    except httpx.RequestError:
        pass
    return {"linked": True, "error": "ML недоступен"}


@router.get("/match/{match_id}")
async def get_player_match_detail(
    match_id: int,
    refresh: bool = False,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Карточка одного матча текущего игрока.

    Проверяет, что в этом матче играл именно этот аккаунт, и только
    тогда проксирует в ML. Сторонние матчи (например, скопированный из
    чата ID) не отдаём, чтобы не превращать сервис в открытый прокси
    к OpenDota.
    """
    account_id = _owned_match_account_id(db, current_user, match_id)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/match-detail/{match_id}",
                params={"account_id": account_id, "refresh": str(refresh).lower()},
                headers=ml_headers(),
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"ML сервис недоступен: {e}")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=resp.json().get("detail", "Матч не найден"))
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"ML вернул {resp.status_code}: {resp.text[:300]}")

    return resp.json()


@router.post("/match/{match_id}/request-parse")
async def request_player_match_parse(
    match_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Пнуть OpenDota распарсить матч принудительно (когда ``is_parsed=false``).

    Те же ownership-проверки, что и для GET — ничего чужого пнуть нельзя.
    """
    _owned_match_account_id(db, current_user, match_id)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/match-detail/{match_id}/request-parse",
                headers=ml_headers(),
            )
        return resp.json() if resp.status_code == 200 else {"status": "error", "code": resp.status_code}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"ML сервис недоступен: {e}")


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
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            data = resp.json()
            data["linked"] = True
            return data
    except Exception:
        pass

    return {"linked": True, "account_id": profile.dota_account_id, "steam_id": profile.steam_id}

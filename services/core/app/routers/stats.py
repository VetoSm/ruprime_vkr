import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import PlayerProfile

router = APIRouter(tags=["stats"])


def _stats_filter_params(
    mode: str = "ranked",
    period: str = "50",
    role: int | None = None,
    hero_id: int | None = None,
) -> dict:
    params = {"mode": mode, "period": period}
    if role is not None:
        params["role"] = role
    if hero_id is not None:
        params["hero_id"] = hero_id
    return params


async def _get_or_create_analysis(profile: PlayerProfile, db: Session, filters: dict | None = None) -> dict | None:
    """Try to get existing analysis or create a new one from player_matches."""
    # 1. If we have a cached analysis, fetch it
    if profile.ml_analysis_id and not filters:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/player-analysis/{profile.ml_analysis_id}",
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass

    # 2. If player has account linked, run analysis from player_matches
    if profile.dota_account_id:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/analyze-player/{profile.dota_account_id}",
                    params={"player_profile_id": profile.id, **(filters or {})},
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                data = resp.json()
                # Cache the analysis_id
                if data.get("ml_analysis_id") and not filters:
                    profile.ml_analysis_id = data["ml_analysis_id"]
                    db.commit()
                return data
        except Exception:
            pass

    # 3. Get at least the account profile data from ML
    if profile.dota_account_id:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/player-account/{profile.dota_account_id}",
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                acc = resp.json()
                # Build a partial summary from account data
                total_games = (acc.get("win") or 0) + (acc.get("lose") or 0)
                winrate = (acc.get("win") or 0) / total_games if total_games > 0 else 0
                rank_tier = acc.get("rank_tier")
                totals = acc.get("totals") or {}

                RANK_NAMES = {1: "HERALD", 2: "GUARDIAN", 3: "CRUSADER", 4: "ARCHON",
                              5: "LEGEND", 6: "ANCIENT", 7: "DIVINE", 8: "IMMORTAL"}
                rank_name = "UNKNOWN"
                if rank_tier:
                    medal = rank_tier // 10
                    stars = rank_tier % 10
                    rank_name = f"{RANK_NAMES.get(medal, 'UNKNOWN')} [{stars}]"

                return {
                    "ml_analysis_id": None,
                    "summary": {
                        "estimated_rank_tier": rank_name,
                        "estimated_mmr": acc.get("mmr_estimate") or 0,
                        "games_analyzed": acc.get("matches_loaded", 0),
                        "total_games": acc.get("total_games") or total_games,
                        "winrate": round(winrate, 3),
                        "gpm_avg": totals.get("avg_gpm") or 0,
                        "xpm_avg": totals.get("avg_xpm") or 0,
                        "kda_avg": round(
                            ((totals.get("avg_kills") or 0) + (totals.get("avg_assists") or 0))
                            / max((totals.get("avg_deaths") or 1), 1),
                            2
                        ) if totals else 0,
                        "personaname": acc.get("personaname"),
                        "avatar_url": acc.get("avatar_url"),
                        "estimated_hours": acc.get("estimated_hours", 0),
                    },
                    "trends": {
                        "recent_matches": acc.get("recent_matches", []),
                    },
                    "roles": {
                        "actual_roles_distribution": acc.get("roles_distribution", {}),
                    },
                    "heroes": {
                        "top_heroes": acc.get("heroes_top", []),
                    },
                    "comparisons": {},
                    "warning": acc.get("warning"),
                }
        except Exception:
            pass

    return None


@router.get("/player/{player_id}/stats/overview")
async def player_stats_overview(
    player_id: int,
    mode: str = "ranked",
    period: str = "50",
    role: int | None = None,
    hero_id: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Агрегированная статистика игрока."""
    profile = db.query(PlayerProfile).filter(PlayerProfile.id == player_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль игрока не найден")

    if current_user.role == "PLAYER" and profile.core_user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    filters = _stats_filter_params(mode, period, role, hero_id)
    data = await _get_or_create_analysis(profile, db, filters)

    if data:
        log_action(db, current_user.user_id, current_user.role, "VIEW_STATS",
                   "PLAYER_PROFILE", player_id)
        return data

    return {
        "ml_analysis_id": None,
        "summary": {
            "estimated_rank_tier": profile.actual_rank_tier or "UNKNOWN",
            "games_analyzed": 0,
            "winrate": 0,
            "gpm_avg": 0,
            "xpm_avg": 0,
        },
        "trends": {},
        "roles": {},
        "heroes": {"top_heroes": []},
        "comparisons": {},
    }


@router.get("/player/{player_id}/features")
async def player_features(
    player_id: int,
    mode: str = "ranked",
    period: str = "50",
    role: int | None = None,
    hero_id: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Детальные фичи игрока."""
    profile = db.query(PlayerProfile).filter(PlayerProfile.id == player_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль игрока не найден")

    if current_user.role == "PLAYER" and profile.core_user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    filters = _stats_filter_params(mode, period, role, hero_id)
    data = await _get_or_create_analysis(profile, db, filters)

    if data:
        log_action(db, current_user.user_id, current_user.role, "VIEW_FEATURES",
                   "PLAYER_PROFILE", player_id)
        return {
            "ml_analysis_id": data.get("ml_analysis_id"),
            "features": data.get("features", {}),
            "weaknesses_ranked": data.get("weaknesses_ranked", []),
            "strengths_ranked": data.get("strengths_ranked", []),
        }

    return {
        "ml_analysis_id": None,
        "features": {},
        "weaknesses_ranked": [],
        "strengths_ranked": [],
    }


@router.get("/player/{player_id}/detailed-features")
async def player_detailed_features(
    player_id: int,
    mode: str = "ranked",
    period: str = "50",
    role: int | None = None,
    hero_id: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Детальные фичи с drill-down: 6 категорий, score/target/gap vs эталон."""
    profile = db.query(PlayerProfile).filter(PlayerProfile.id == player_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    if current_user.role == "PLAYER" and profile.core_user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    if not profile.dota_account_id:
        return {"categories": [], "overall_score": 0, "error": "Аккаунт не привязан"}

    try:
        params = _stats_filter_params(mode, period, role, hero_id)
        if profile.desired_rank_tier:
            params["desired_rank"] = profile.desired_rank_tier
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.ML_SERVICE_URL}/ml/detailed-features/{profile.dota_account_id}",
                params=params,
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            log_action(db, current_user.user_id, current_user.role, "VIEW_DETAILED_FEATURES",
                       "PLAYER_PROFILE", player_id)
            return resp.json()
    except Exception:
        pass

    return {"categories": [], "overall_score": 0, "error": "Ошибка загрузки фичей"}

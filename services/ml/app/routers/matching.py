import uuid

import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.database import get_db, engine
from app.schemas import MatchCoachesRequest, MatchCoachesResponse, CoachRecommendation, AiCoachSuggestion
from app.feature_engine import analyze_player_from_account, rank_tier_to_mmr_band
from app.detailed_features import compute_detailed_features
from app.models import PlayerMatch, PlayerAccount, MlKaggleBaseline

router = APIRouter(prefix="/ml", tags=["ml-matching"])


@router.post("/match-coaches", response_model=MatchCoachesResponse)
def match_coaches(body: MatchCoachesRequest, db: Session = Depends(get_db)):
    """Analyze a player and recommend coaches based on real data."""
    profile = body.player_profile

    # Try to get account_id
    account_id = None
    if profile.dota_account_id:
        try:
            account_id = int(profile.dota_account_id)
        except (ValueError, TypeError):
            pass

    # Analyze player from their actual match data (player_matches)
    analysis = None
    player_stats = {}

    if account_id:
        # Check if we have matches for this player
        match_count = db.query(sqlfunc.count(PlayerMatch.id)).filter(
            PlayerMatch.account_id == account_id
        ).scalar() or 0

        if match_count > 0:
            analysis = analyze_player_from_account(account_id, profile.player_profile_id, db)
            player_stats = _compute_player_stats(account_id, db)

    if not analysis:
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        analysis = {
            "ml_analysis_id": analysis_id,
            "summary": {
                "estimated_rank_tier": "BEGINNER",
                "estimated_mmr": 1000,
                "games_analyzed": 0,
                "winrate": 0,
                "gpm_avg": 0,
                "xpm_avg": 0,
            },
            "weaknesses_ranked": [],
            "strengths_ranked": [],
        }

    # Compute detailed features with gaps
    feature_gaps = []
    weak_categories = []
    if account_id:
        desired_rank = profile.desired_rank_tier or "IMMORTAL"
        detailed = compute_detailed_features(account_id, desired_rank, db)
        feature_gaps = detailed.get("top_gaps", [])
        weak_categories = [g.get("category_key") for g in feature_gaps[:3]]

    # Build player assessment
    player_assessment = {
        "summary": analysis.get("summary", {}),
        "weaknesses": analysis.get("weaknesses_ranked", []),
        "strengths": analysis.get("strengths_ranked", []),
        "desired_role": body.request.desired_role,
        "focus_area": body.request.focus_area,
        "player_stats": player_stats,
        "feature_gaps": feature_gaps[:5],
        "weak_categories": weak_categories,
    }

    # Smart coach recommendations based on actual data + feature gaps
    coaches_data = body.coaches if hasattr(body, 'coaches') and body.coaches else []
    recommended_coaches = _smart_match_coaches(
        player_assessment=player_assessment,
        coaches=coaches_data,
        desired_role=body.request.desired_role,
        focus_area=body.request.focus_area,
        weak_categories=weak_categories,
    )

    # AI coach suggestion
    ai_suggestion = None
    if body.request.use_ai_coach:
        summary = analysis.get("summary", {})
        weaknesses = analysis.get("weaknesses_ranked", [])
        weak_desc = ", ".join([w.get("description", w.get("feature", "")) for w in weaknesses[:3]])

        ai_suggestion = AiCoachSuggestion(
            summary=f"На основе {summary.get('games_analyzed', 0)} проанализированных матчей "
                    f"(винрейт: {summary.get('winrate', 0):.0%}, MMR: ~{summary.get('estimated_mmr', '?')}). "
                    + (f"Области для улучшения: {weak_desc}." if weak_desc else ""),
            plan=_generate_training_plan(analysis, body.request.desired_role, body.request.focus_area),
        )

    return MatchCoachesResponse(
        ml_analysis_id=analysis["ml_analysis_id"],
        player_assessment=player_assessment,
        recommended_coaches=recommended_coaches,
        ai_coach_suggestion=ai_suggestion,
    )


def _compute_player_stats(account_id: int, db: Session) -> dict:
    """Compute key stats from player_matches for matching."""
    query = f"""
    SELECT hero_id, lane_role, kills, deaths, assists,
           gold_per_min, xp_per_min, last_hits, hero_damage, tower_damage,
           duration, player_slot, radiant_win
    FROM player_matches
    WHERE account_id = {account_id}
    """
    df = pd.read_sql(query, engine)
    if df.empty:
        return {}

    df["win"] = df.apply(
        lambda r: (r["radiant_win"] if r["player_slot"] is not None and r["player_slot"] < 128
                   else not r["radiant_win"]) if r["radiant_win"] is not None else False,
        axis=1,
    ).astype(int)
    df["kda"] = (df["kills"].fillna(0) + df["assists"].fillna(0)) / df["deaths"].fillna(0).clip(lower=1)

    # Role distribution
    roles_dist = df["lane_role"].dropna().value_counts(normalize=True).to_dict()
    main_roles = sorted(roles_dist.items(), key=lambda x: x[1], reverse=True)

    # Hero distribution
    hero_counts = df["hero_id"].value_counts().head(5)
    top_heroes = hero_counts.index.tolist()

    # Weakest role (lowest winrate)
    role_wr = df.groupby("lane_role")["win"].mean().to_dict()
    weakest_role = min(role_wr.items(), key=lambda x: x[1])[0] if role_wr else None

    return {
        "avg_gpm": round(df["gold_per_min"].fillna(0).mean(), 1),
        "avg_xpm": round(df["xp_per_min"].fillna(0).mean(), 1),
        "avg_kda": round(df["kda"].mean(), 2),
        "winrate": round(df["win"].mean(), 3),
        "total_matches": len(df),
        "main_roles": {f"POS{int(k)}": round(v, 3) for k, v in main_roles if pd.notna(k)},
        "top_hero_ids": top_heroes,
        "weakest_role": int(weakest_role) if weakest_role and pd.notna(weakest_role) else None,
        "role_winrates": {f"POS{int(k)}": round(v, 3) for k, v in role_wr.items() if pd.notna(k)},
    }


def _smart_match_coaches(
    player_assessment: dict,
    coaches: list,
    desired_role: str = None,
    focus_area: str = None,
    weak_categories: list = None,
) -> list[CoachRecommendation]:
    """
    Score and rank coaches based on player's actual data.
    If no coaches list provided, return mock recommendations with smart reasons.
    """
    summary = player_assessment.get("summary", {})
    weaknesses = player_assessment.get("weaknesses", [])
    strengths = player_assessment.get("strengths", [])
    player_stats = player_assessment.get("player_stats", {})
    estimated_mmr = summary.get("estimated_mmr", 1000)
    weak_features = [w.get("feature", "") for w in weaknesses]

    # If coaches list provided from Core, score them
    if coaches:
        scored = []
        for coach_obj in coaches:
            coach = coach_obj if isinstance(coach_obj, dict) else coach_obj.model_dump()
            score = _score_coach(coach, estimated_mmr, desired_role, focus_area,
                                 weak_features, player_stats, weak_categories)
            reasons = _generate_reasons(coach, desired_role, focus_area, weak_features, estimated_mmr)
            scored.append(CoachRecommendation(
                coach_profile_id=coach.get("id", 0),
                score=round(score, 2),
                reasons=reasons,
            ))
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:5]

    # Mock recommendations with smart reasons based on player data
    reasons_base = []
    if desired_role:
        reasons_base.append(f"Специализация на {desired_role}")
    if focus_area:
        area_map = {
            "lane_control": "контроле линии",
            "macro": "макро и движении по карте",
            "hero_pool": "расширении пула героев",
            "teamfight": "позиционировании в тимфайтах",
            "communication": "командной коммуникации",
        }
        reasons_base.append(f"Опыт в обучении {area_map.get(focus_area, focus_area)}")

    if estimated_mmr > 0:
        mmr_range = f"{estimated_mmr}-{estimated_mmr + 2000}"
        reasons_base.append(f"Работает с игроками уровня {mmr_range} MMR")

    if weaknesses:
        weak_desc = weaknesses[0].get("description", "")
        if weak_desc:
            reasons_base.append(f"Поможет улучшить: {weak_desc}")

    mock = [
        CoachRecommendation(
            coach_profile_id=1,
            score=0.92,
            reasons=reasons_base[:3] + ["Высокий рейтинг учеников"],
        ),
        CoachRecommendation(
            coach_profile_id=2,
            score=0.85,
            reasons=[f"Экс-профессиональный игрок"] + reasons_base[:2],
        ),
        CoachRecommendation(
            coach_profile_id=3,
            score=0.78,
            reasons=reasons_base[:2] + ["Доступная ставка"],
        ),
    ]
    return mock


def _score_coach(coach: dict, player_mmr: int, desired_role: str,
                 focus_area: str, weak_features: list, player_stats: dict,
                 weak_categories: list = None) -> float:
    """Score a coach's compatibility with the player (0-1)."""
    score = 0.5  # base

    # MMR: coach should be significantly higher
    coach_mmr = coach.get("mmr_estimate", 0) or 0
    if coach_mmr > 0 and player_mmr > 0:
        mmr_diff = coach_mmr - player_mmr
        if mmr_diff >= 2000:
            score += 0.2
        elif mmr_diff >= 1000:
            score += 0.1
        elif mmr_diff < 500:
            score -= 0.1

    # Role match
    coach_roles = coach.get("main_roles", []) or []
    if desired_role and desired_role in coach_roles:
        score += 0.15

    # Hero pool overlap with player's top heroes
    coach_heroes = coach.get("hero_pool", []) or []
    player_heroes = player_stats.get("top_hero_ids", [])
    if coach_heroes and player_heroes:
        overlap = len(set(str(h) for h in player_heroes) & set(str(h) for h in coach_heroes))
        score += min(overlap * 0.05, 0.15)

    # Experience bonus
    exp = coach.get("experience_years", 0) or 0
    if exp >= 5:
        score += 0.1
    elif exp >= 3:
        score += 0.05

    # Feature gap category match
    # Map coach roles to categories they can help with
    ROLE_CATEGORY_MAP = {
        "POS1": ["farming", "early_game"],
        "POS2": ["combat", "early_game"],
        "POS3": ["initiation", "survival"],
        "POS4": ["vision", "initiation"],
        "POS5": ["vision", "survival"],
    }
    if weak_categories and coach_roles:
        for role in coach_roles:
            coach_cats = ROLE_CATEGORY_MAP.get(role, [])
            overlap = len(set(coach_cats) & set(weak_categories or []))
            score += overlap * 0.1

    return min(max(score, 0), 1.0)


def _generate_reasons(coach: dict, desired_role: str, focus_area: str,
                      weak_features: list, player_mmr: int) -> list[str]:
    """Generate human-readable reasons for coach recommendation."""
    reasons = []
    coach_roles = coach.get("main_roles", []) or []

    if desired_role and desired_role in coach_roles:
        reasons.append(f"Специализация на {desired_role}")

    coach_mmr = coach.get("mmr_estimate", 0) or 0
    if coach_mmr > player_mmr + 1500:
        reasons.append(f"MMR {coach_mmr} — значительно выше вашего")

    exp = coach.get("experience_years", 0) or 0
    if exp >= 3:
        reasons.append(f"Опыт тренерства: {exp} лет")

    if focus_area:
        reasons.append(f"Поможет с: {focus_area}")

    if not reasons:
        reasons.append("Подходящий профиль")

    return reasons[:4]


def _generate_training_plan(analysis: dict, desired_role: str = None, focus_area: str = None) -> list[str]:
    """Generate a training plan based on analysis."""
    plan = []
    weaknesses = analysis.get("weaknesses_ranked", [])

    for w in weaknesses[:3]:
        feature = w.get("feature", "")
        plans = {
            "gpm": "Тренируйте фарм-паттерны: практикуйте добивание крипов 15 мин/день в демо режиме",
            "xpm": "Повышайте эффективность получения опыта: не бродите без цели, ротируйте с умом",
            "kda": "Работайте над позиционированием в тимфайтах и избегайте ненужных смертей",
            "last_hits": "Потренируйте ласт-хит: цель — 50+ CS к 10 минуте",
            "hero_damage": "Наносите больше урона: позиционируйтесь агрессивнее при наличии ключевых предметов",
            "tower_damage": "Давите объекты после выигранных файтов: всегда смотрите на башню или Рошана",
            "teamfight": "Участвуйте в тимфайтах: в мид-гейме держитесь с командой у объектов",
            "vision": "Ставьте больше вардов: как минимум 2 обсервера за 5 минут (для саппортов)",
        }
        if feature in plans:
            plan.append(plans[feature])

    if desired_role:
        role_plans = {
            "POS1": "Как керри: фокус на фарм-паттернах и выборе тайминга для вступления в бой",
            "POS2": "Как мидер: контролируйте руны, ищите ротации после победы на линии",
            "POS3": "Как оффлейнер: создавайте пространство, не фармите пассивно",
            "POS4": "Как роумер: приоритет ганкам мида, стакайте лагеря для керри",
            "POS5": "Как хард саппорт: тяните крипов для равновесия линии, покупайте сентри",
        }
        if desired_role in role_plans:
            plan.append(role_plans[desired_role])

    if not plan:
        plan = [
            "Сфокусируйтесь на 3-5 героях для набора MMR",
            "Смотрите реплеи проигранных матчей",
            "Следите за миникартой каждые 3-5 секунд",
        ]

    return plan

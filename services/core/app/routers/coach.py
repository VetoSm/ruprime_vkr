import os
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from collections import Counter

from app.models import (
    CoachProfile,
    CoreUser,
    PlayerProfile,
    TrainingSession,
    TrainingRequest,
    SessionStatus,
)
from app.schemas import CoachProfileUpdate, CoachProfileResponse


RANK_NAMES = {
    1: "HERALD", 2: "GUARDIAN", 3: "CRUSADER", 4: "ARCHON",
    5: "LEGEND", 6: "ANCIENT", 7: "DIVINE", 8: "IMMORTAL",
}
RANK_MMR = {
    "HERALD": 700, "GUARDIAN": 1500, "CRUSADER": 2200, "ARCHON": 2900,
    "LEGEND": 3600, "ANCIENT": 4300, "DIVINE": 5000, "IMMORTAL": 5700,
}
ROLE_TO_POS = {1: "POS1", 2: "POS2", 3: "POS3", 4: "POS4", 5: "POS5"}

logger = logging.getLogger(__name__)

router = APIRouter(tags=["coach"])

HIDE_TEST_COACHES = os.getenv("HIDE_TEST_COACHES", "true").lower() in ("true", "1", "yes")
TEST_COACH_AUTH_IDS = {
    int(v.strip()) for v in os.getenv("TEST_COACH_AUTH_IDS", "4,5").split(",") if v.strip().isdigit()
}


def _coach_dota_account_id(c: CoachProfile, db: Session) -> Optional[str]:
    """Look up the coach's linked Dota account_id, if any.

    We surface this in the public coach catalog so the frontend can pull
    the cached Steam avatar without an extra round-trip through admin
    endpoints. Returns the raw ``dota_account_id`` string from the linked
    ``PlayerProfile`` (same ``core_user_id``) — or ``None`` when the coach
    hasn't linked Steam yet.
    """
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == c.core_user_id
    ).first()
    if profile and profile.dota_account_id:
        return profile.dota_account_id
    return None


@router.get("/coach/profile", response_model=CoachProfileResponse)
def get_coach_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current coach's profile."""
    profile = db.query(CoachProfile).filter(
        CoachProfile.core_user_id == current_user.user_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Coach profile not found. Create one first.")
    return CoachProfileResponse(
        id=profile.id,
        core_user_id=profile.core_user_id,
        mmr_estimate=profile.mmr_estimate,
        rank_tier=profile.rank_tier,
        main_roles=profile.main_roles,
        hero_pool=profile.hero_pool,
        hourly_rate=profile.hourly_rate,
        experience_years=profile.experience_years,
        about=profile.about,
        is_verified=bool(profile.is_verified),
        dota_account_id=_coach_dota_account_id(profile, db),
        profile_complete=bool(profile.about and profile.hourly_rate and (profile.mmr_estimate or profile.rank_tier)),
    )


@router.post("/coach/profile", response_model=CoachProfileResponse)
def create_or_update_coach_profile(
    body: CoachProfileUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update coach profile."""
    if current_user.role not in ("COACH", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only coaches can manage coach profiles")

    profile = db.query(CoachProfile).filter(
        CoachProfile.core_user_id == current_user.user_id
    ).first()

    if not profile:
        profile = CoachProfile(core_user_id=current_user.user_id)
        db.add(profile)

    if body.mmr_estimate is not None:
        profile.mmr_estimate = body.mmr_estimate
    if body.rank_tier is not None:
        profile.rank_tier = body.rank_tier
    if body.main_roles is not None:
        profile.main_roles = body.main_roles
    if body.hero_pool is not None:
        profile.hero_pool = body.hero_pool
    if body.hourly_rate is not None:
        profile.hourly_rate = body.hourly_rate
    if body.experience_years is not None:
        profile.experience_years = body.experience_years
    if body.about is not None:
        profile.about = body.about

    db.commit()
    db.refresh(profile)

    log_action(db, current_user.user_id, current_user.role, "UPDATE_COACH_PROFILE",
               "COACH_PROFILE", profile.id)

    return CoachProfileResponse(
        id=profile.id,
        core_user_id=profile.core_user_id,
        mmr_estimate=profile.mmr_estimate,
        rank_tier=profile.rank_tier,
        main_roles=profile.main_roles,
        hero_pool=profile.hero_pool,
        hourly_rate=profile.hourly_rate,
        experience_years=profile.experience_years,
        about=profile.about,
        is_verified=bool(profile.is_verified),
        dota_account_id=_coach_dota_account_id(profile, db),
        profile_complete=bool(profile.about and profile.hourly_rate and (profile.mmr_estimate or profile.rank_tier)),
    )


@router.get("/coaches", response_model=list[CoachProfileResponse])
def list_coaches(
    role: str = Query(None, description="Filter by main role"),
    min_rate: float = Query(None),
    max_rate: float = Query(None),
    include_unverified: bool = Query(False, description="ADMIN only: also show unverified coaches"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List coaches visible in the catalog.

    Every verified coach shows up — even ones with empty manual profiles.
    For empty fields we fall back to data we can compute automatically from
    their linked Steam history (top roles, hero pool, rank, MMR estimate)
    so the catalog never feels empty just because a coach hasn't filled
    everything in yet.
    """
    query = db.query(CoachProfile).join(
        CoreUser, CoreUser.id == CoachProfile.core_user_id
    )

    if min_rate is not None:
        query = query.filter(CoachProfile.hourly_rate >= min_rate)
    if max_rate is not None:
        query = query.filter(CoachProfile.hourly_rate <= max_rate)

    if HIDE_TEST_COACHES and TEST_COACH_AUTH_IDS:
        query = query.filter(~CoreUser.auth_user_id.in_(TEST_COACH_AUTH_IDS))

    if not (current_user.role == "ADMIN" and include_unverified):
        query = query.filter(CoachProfile.is_verified == True)  # noqa: E712

    coaches = query.order_by(CoachProfile.id.desc()).all()

    enriched: list[dict] = []
    for c in coaches:
        auto = _coach_autofill(c, db)
        manual_roles = c.main_roles if c.main_roles else None
        effective_roles = manual_roles or auto.get("main_roles") or []
        if role and role not in effective_roles:
            continue
        enriched.append({
            "id": c.id,
            "core_user_id": c.core_user_id,
            "mmr_estimate": c.mmr_estimate,
            "rank_tier": c.rank_tier,
            "main_roles": c.main_roles,
            "hero_pool": c.hero_pool,
            "hourly_rate": c.hourly_rate,
            "experience_years": c.experience_years,
            "about": c.about,
            "is_verified": bool(c.is_verified),
            "dota_account_id": _coach_dota_account_id(c, db),
            "auto_main_roles": auto.get("main_roles"),
            "auto_hero_pool": auto.get("hero_pool"),
            "auto_rank_tier": auto.get("rank_tier"),
            "auto_mmr_estimate": auto.get("mmr_estimate"),
            "profile_complete": bool(c.about and c.hourly_rate and (c.mmr_estimate or c.rank_tier)),
        })
    return enriched


def _coach_autofill(c: CoachProfile, db: Session) -> dict:
    """Derive sensible defaults for a coach profile from their linked Steam.

    Looks for a ``PlayerProfile`` belonging to the same ``core_user_id``.
    From the cached OpenDota data we compute:
      * rank_tier label (medal + stars)
      * MMR estimate from rank_tier
      * top 3 roles from the most recent ranked matches
      * top 5 most-played heroes
    """
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == c.core_user_id
    ).first()
    if not profile or not profile.dota_account_id or not profile.dota_account_id.isdigit():
        return {}

    account_id = int(profile.dota_account_id)
    out: dict = {}

    pa_row = db.execute(
        sql_text("SELECT rank_tier FROM player_accounts WHERE account_id = :aid"),
        {"aid": account_id},
    ).fetchone()
    rank_tier = int(pa_row[0]) if pa_row and pa_row[0] else None

    if rank_tier:
        medal = rank_tier // 10
        stars = rank_tier % 10
        rank_label = f"{RANK_NAMES.get(medal, 'UNKNOWN')} [{stars}]"
        out["rank_tier"] = rank_label
        out["mmr_estimate"] = RANK_MMR.get(RANK_NAMES.get(medal, ""))
    elif profile.actual_rank_tier:
        out["rank_tier"] = profile.actual_rank_tier

    role_rows = db.execute(
        sql_text(
            """
            SELECT lane_role, hero_id
            FROM player_matches
            WHERE account_id = :aid
              AND game_mode IN (2,3,4,22)
            ORDER BY start_time DESC NULLS LAST
            LIMIT 200
            """
        ),
        {"aid": account_id},
    ).fetchall()
    if role_rows:
        roles_counter: Counter[int] = Counter()
        heroes_counter: Counter[int] = Counter()
        for lane_role, hero_id in role_rows:
            if lane_role and 1 <= int(lane_role) <= 5:
                roles_counter[int(lane_role)] += 1
            if hero_id:
                heroes_counter[int(hero_id)] += 1
        if roles_counter:
            out["main_roles"] = [
                ROLE_TO_POS[r]
                for r, _ in roles_counter.most_common(3)
                if r in ROLE_TO_POS
            ]
        if heroes_counter:
            out["hero_pool"] = [str(h) for h, _ in heroes_counter.most_common(5)]
    return out


@router.get("/coach/students-overview")
async def coach_students_overview(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return aggregated stats for every player the current coach has or had
    a training session with.

    Per student we surface:
      * basic identity (player_profile_id, label),
      * latest ML analysis summary (estimated MMR, winrate, rank),
      * last / next session dates,
      * number of completed vs planned sessions with this coach.

    Only COACH and ADMIN callers may hit the endpoint. For ADMIN the coach
    context is derived from their own profile if any, otherwise empty.
    """
    if current_user.role not in ("COACH", "ADMIN"):
        raise HTTPException(status_code=403, detail="Только тренер может просматривать своих учеников")

    coach_profile = db.query(CoachProfile).filter(
        CoachProfile.core_user_id == current_user.user_id
    ).first()
    if not coach_profile:
        return {"coach_profile_id": None, "students": []}

    sessions = db.query(TrainingSession).filter(
        TrainingSession.coach_profile_id == coach_profile.id,
    ).all()
    if not sessions:
        return {"coach_profile_id": coach_profile.id, "students": []}

    # Group sessions by player_profile_id via the linked training request.
    buckets: dict[int, dict] = {}
    for s in sessions:
        req = db.query(TrainingRequest).filter(TrainingRequest.id == s.training_request_id).first()
        if not req or not req.player_profile_id:
            continue
        bucket = buckets.setdefault(req.player_profile_id, {
            "sessions_total": 0,
            "sessions_completed": 0,
            "last_completed_at": None,
            "next_planned_at": None,
        })
        bucket["sessions_total"] += 1
        if s.status == SessionStatus.COMPLETED:
            bucket["sessions_completed"] += 1
            if s.scheduled_at and (
                bucket["last_completed_at"] is None or s.scheduled_at > bucket["last_completed_at"]
            ):
                bucket["last_completed_at"] = s.scheduled_at
        if s.status == SessionStatus.PLANNED and s.scheduled_at:
            if bucket["next_planned_at"] is None or s.scheduled_at < bucket["next_planned_at"]:
                bucket["next_planned_at"] = s.scheduled_at

    students = []
    for player_profile_id, agg in buckets.items():
        profile = db.query(PlayerProfile).filter(PlayerProfile.id == player_profile_id).first()
        if not profile:
            continue

        analysis_summary = None
        # Try to pull a lightweight ML analysis summary when we already have
        # an ml_analysis_id cached. This reuses the same pipeline as the
        # player's own dashboard, so numbers match.
        if profile.ml_analysis_id:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.get(
                        f"{settings.ML_SERVICE_URL}/ml/player-analysis/{profile.ml_analysis_id}",
                        headers=ml_headers(),
                    )
                if resp.status_code == 200:
                    analysis_summary = (resp.json() or {}).get("summary")
            except httpx.RequestError as exc:
                logger.warning("Failed to fetch analysis for %s: %s", profile.id, exc)

        students.append({
            "player_profile_id": profile.id,
            "core_user_id": profile.core_user_id,
            "dota_account_id": profile.dota_account_id,
            "actual_rank_tier": profile.actual_rank_tier,
            "desired_rank_tier": profile.desired_rank_tier,
            "sessions_total": agg["sessions_total"],
            "sessions_completed": agg["sessions_completed"],
            "last_completed_at": agg["last_completed_at"].isoformat() if agg["last_completed_at"] else None,
            "next_planned_at": agg["next_planned_at"].isoformat() if agg["next_planned_at"] else None,
            "analysis_summary": analysis_summary,
        })

    # Stable order: upcoming sessions first, then by completed count desc.
    students.sort(key=lambda s: (
        s["next_planned_at"] is None,
        s["next_planned_at"] or "",
        -s["sessions_completed"],
    ))

    return {"coach_profile_id": coach_profile.id, "students": students}

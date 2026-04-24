import os
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import (
    CoachProfile,
    CoreUser,
    PlayerProfile,
    TrainingSession,
    TrainingRequest,
    SessionStatus,
)
from app.schemas import CoachProfileUpdate, CoachProfileResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["coach"])

HIDE_TEST_COACHES = os.getenv("HIDE_TEST_COACHES", "true").lower() in ("true", "1", "yes")
TEST_COACH_AUTH_IDS = {
    int(v.strip()) for v in os.getenv("TEST_COACH_AUTH_IDS", "4,5").split(",") if v.strip().isdigit()
}


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
    return profile


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

    return profile


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

    Players and coaches only see coaches that the tech account has verified
    (``CoachProfile.is_verified=True``). Admins can pass
    ``include_unverified=1`` to inspect self-registered applications.
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

    query = query.filter(
        CoachProfile.about.isnot(None),
        CoachProfile.hourly_rate.isnot(None),
        CoachProfile.mmr_estimate.isnot(None),
    )

    # Verification gate. Admin can override for debugging.
    if not (current_user.role == "ADMIN" and include_unverified):
        query = query.filter(CoachProfile.is_verified == True)  # noqa: E712

    coaches = query.order_by(CoachProfile.id.desc()).all()

    # Filter by role in Python (JSON field)
    if role:
        coaches = [c for c in coaches if c.main_roles and role in c.main_roles]

    return coaches


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

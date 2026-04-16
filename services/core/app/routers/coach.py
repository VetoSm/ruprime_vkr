import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.models import CoachProfile, CoreUser
from app.schemas import CoachProfileUpdate, CoachProfileResponse

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
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List all coaches with optional filters."""
    query = db.query(CoachProfile).join(
        CoreUser, CoreUser.id == CoachProfile.core_user_id
    )

    if min_rate is not None:
        query = query.filter(CoachProfile.hourly_rate >= min_rate)
    if max_rate is not None:
        query = query.filter(CoachProfile.hourly_rate <= max_rate)

    if HIDE_TEST_COACHES and TEST_COACH_AUTH_IDS:
        query = query.filter(~CoreUser.auth_user_id.in_(TEST_COACH_AUTH_IDS))

    # Show only filled coach profiles in the catalog.
    query = query.filter(
        CoachProfile.about.isnot(None),
        CoachProfile.hourly_rate.isnot(None),
        CoachProfile.mmr_estimate.isnot(None),
    )

    coaches = query.order_by(CoachProfile.id.desc()).all()

    # Filter by role in Python (JSON field)
    if role:
        coaches = [c for c in coaches if c.main_roles and role in c.main_roles]

    return coaches

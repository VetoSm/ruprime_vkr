from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser
from app.models import PlayerProfile, CoachProfile, TrainingRequest, TrainingSession, CoachReview, RequestStatus
from app.schemas import MeOverviewResponse

router = APIRouter(tags=["me"])


@router.get("/me/overview", response_model=MeOverviewResponse)
def me_overview(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return overview for the current user based on role."""

    if current_user.role == "PLAYER":
        profile = db.query(PlayerProfile).filter(
            PlayerProfile.core_user_id == current_user.user_id
        ).first()

        active_requests = db.query(TrainingRequest).filter(
            TrainingRequest.player_profile_id == (profile.id if profile else -1),
            TrainingRequest.status.notin_([RequestStatus.CANCELLED, RequestStatus.REJECTED]),
        ).count()

        upcoming_sessions = 0
        if profile:
            upcoming_sessions = db.query(TrainingSession).join(TrainingRequest).filter(
                TrainingRequest.player_profile_id == profile.id,
                TrainingSession.status == "PLANNED",
            ).count()

        return MeOverviewResponse(
            role="PLAYER",
            profile={
                "id": profile.id if profile else None,
                "desired_rank_tier": profile.desired_rank_tier if profile else None,
                "actual_rank_tier": profile.actual_rank_tier if profile else None,
                "steam_id": profile.steam_id if profile else None,
                "ml_analysis_id": profile.ml_analysis_id if profile else None,
            },
            stats={
                "active_requests": active_requests,
                "upcoming_sessions": upcoming_sessions,
            },
        )

    elif current_user.role == "COACH":
        profile = db.query(CoachProfile).filter(
            CoachProfile.core_user_id == current_user.user_id
        ).first()

        upcoming_sessions = 0
        avg_rating = None
        if profile:
            upcoming_sessions = db.query(TrainingSession).filter(
                TrainingSession.coach_profile_id == profile.id,
                TrainingSession.status == "PLANNED",
            ).count()

            avg = db.query(sqlfunc.avg(CoachReview.rating)).filter(
                CoachReview.coach_profile_id == profile.id
            ).scalar()
            avg_rating = round(float(avg), 2) if avg else None

        # A coach can also have a PlayerProfile attached (we create one when
        # they link their Steam, so that the AI / dashboard can analyse their
        # own matches the same way they analyse their students). Surface its
        # id here so the coach UI can deep-link into the player views.
        player_profile = db.query(PlayerProfile).filter(
            PlayerProfile.core_user_id == current_user.user_id
        ).first()

        return MeOverviewResponse(
            role="COACH",
            profile={
                "id": profile.id if profile else None,
                "mmr_estimate": profile.mmr_estimate if profile else None,
                "rank_tier": profile.rank_tier if profile else None,
                "is_verified": profile.is_verified if profile else False,
                "player_profile_id": player_profile.id if player_profile else None,
                "steam_id": player_profile.steam_id if player_profile else None,
                "dota_account_id": player_profile.dota_account_id if player_profile else None,
                "actual_rank_tier": player_profile.actual_rank_tier if player_profile else None,
            },
            stats={
                "upcoming_sessions": upcoming_sessions,
                "avg_rating": avg_rating,
            },
        )

    else:  # ADMIN
        from app.models import CoreUser
        total_users = db.query(CoreUser).count()
        total_players = db.query(PlayerProfile).count()
        total_coaches = db.query(CoachProfile).count()
        total_requests = db.query(TrainingRequest).count()
        total_sessions = db.query(TrainingSession).count()

        return MeOverviewResponse(
            role="ADMIN",
            profile=None,
            stats={
                "total_users": total_users,
                "total_players": total_players,
                "total_coaches": total_coaches,
                "total_requests": total_requests,
                "total_sessions": total_sessions,
            },
        )

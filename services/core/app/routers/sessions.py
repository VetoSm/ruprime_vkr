from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.models import (
    PlayerProfile, CoachProfile, TrainingRequest,
    TrainingSession, CoachReview, SessionStatus,
)
from app.schemas import (
    PatchTrainingSession, TrainingSessionResponse,
    SessionReportRequest, CreateReviewRequest, ReviewResponse,
    MessageResponse,
)

router = APIRouter(tags=["sessions"])


def _to_session_response(session: TrainingSession, db: Session) -> TrainingSessionResponse:
    req = db.query(TrainingRequest).filter(TrainingRequest.id == session.training_request_id).first()
    player_profile = None
    coach_profile = None

    if req:
        player_profile = db.query(PlayerProfile).filter(PlayerProfile.id == req.player_profile_id).first()
    if session.coach_profile_id:
        coach_profile = db.query(CoachProfile).filter(CoachProfile.id == session.coach_profile_id).first()

    player_label = f"Игрок #{player_profile.id}" if player_profile else "Игрок"
    coach_label = f"Тренер #{coach_profile.id}" if coach_profile else f"Тренер #{session.coach_profile_id}"

    return TrainingSessionResponse(
        id=session.id,
        training_request_id=session.training_request_id,
        coach_profile_id=session.coach_profile_id,
        player_profile_id=player_profile.id if player_profile else None,
        player_core_user_id=player_profile.core_user_id if player_profile else None,
        coach_core_user_id=coach_profile.core_user_id if coach_profile else None,
        player_label=player_label,
        coach_label=coach_label,
        request_status=req.status.value if req else None,
        scheduled_at=session.scheduled_at,
        duration_minutes=session.duration_minutes,
        status=session.status.value,
        report=session.report,
        created_at=session.created_at,
    )


@router.get("/training-sessions/my", response_model=list[TrainingSessionResponse])
def my_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current user's training sessions (player or coach)."""
    if current_user.role == "PLAYER":
        profile = db.query(PlayerProfile).filter(
            PlayerProfile.core_user_id == current_user.user_id
        ).first()
        if not profile:
            return []
        sessions = db.query(TrainingSession).join(TrainingRequest).filter(
            TrainingRequest.player_profile_id == profile.id,
        ).order_by(TrainingSession.scheduled_at.desc().nullslast()).all()

    elif current_user.role == "COACH":
        profile = db.query(CoachProfile).filter(
            CoachProfile.core_user_id == current_user.user_id
        ).first()
        if not profile:
            return []
        sessions = db.query(TrainingSession).filter(
            TrainingSession.coach_profile_id == profile.id,
        ).order_by(TrainingSession.scheduled_at.desc().nullslast()).all()

    else:  # ADMIN
        sessions = db.query(TrainingSession).order_by(
            TrainingSession.created_at.desc()
        ).limit(100).all()

    return [_to_session_response(s, db) for s in sessions]


@router.patch("/training-sessions/{session_id}", response_model=TrainingSessionResponse)
def patch_session(
    session_id: int,
    body: PatchTrainingSession,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reschedule, cancel, or complete a training session."""
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    req = db.query(TrainingRequest).filter(TrainingRequest.id == session.training_request_id).first()
    player_profile = db.query(PlayerProfile).filter(
        PlayerProfile.id == (req.player_profile_id if req else -1)
    ).first()
    coach_profile = db.query(CoachProfile).filter(
        CoachProfile.id == session.coach_profile_id
    ).first()

    is_admin = current_user.role == "ADMIN"
    is_owner_player = bool(player_profile and player_profile.core_user_id == current_user.user_id)
    is_owner_coach = bool(coach_profile and coach_profile.core_user_id == current_user.user_id)

    if not (is_admin or is_owner_player or is_owner_coach):
        raise HTTPException(status_code=403, detail="Нет доступа к сессии")

    if body.action == "CANCEL":
        session.status = SessionStatus.CANCELLED
        log_action(db, current_user.user_id, current_user.role, "CANCEL_SESSION",
                   "TRAINING_SESSION", session_id)

    elif body.action == "COMPLETE":
        if not (is_admin or is_owner_coach):
            raise HTTPException(status_code=403, detail="Только тренер или админ могут завершить сессию")
        session.status = SessionStatus.COMPLETED
        log_action(db, current_user.user_id, current_user.role, "COMPLETE_SESSION",
                   "TRAINING_SESSION", session_id)

    elif body.action == "RESCHEDULE":
        if not (is_admin or is_owner_player or is_owner_coach):
            raise HTTPException(status_code=403, detail="Нет доступа на перенос сессии")
        if not body.scheduled_at:
            raise HTTPException(status_code=400, detail="New scheduled_at required for reschedule")

        # Create new session, mark old as rescheduled
        new_session = TrainingSession(
            training_request_id=session.training_request_id,
            coach_profile_id=session.coach_profile_id,
            scheduled_at=body.scheduled_at,
            duration_minutes=session.duration_minutes,
            status=SessionStatus.PLANNED,
            rescheduled_from_id=session.id,
        )
        session.status = SessionStatus.RESCHEDULED
        db.add(new_session)
        db.commit()
        db.refresh(new_session)

        log_action(db, current_user.user_id, current_user.role, "RESCHEDULE_SESSION",
                   "TRAINING_SESSION", new_session.id)

        return _to_session_response(new_session, db)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    db.commit()
    db.refresh(session)

    return _to_session_response(session, db)


@router.post("/training-sessions/{session_id}/report", response_model=MessageResponse)
def session_report(
    session_id: int,
    body: SessionReportRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Coach submits a report for a completed session."""
    if current_user.role not in ("COACH", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only coaches can submit reports")

    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.report = body.report
    if body.duration_minutes:
        session.duration_minutes = body.duration_minutes
    db.commit()

    log_action(db, current_user.user_id, current_user.role, "SUBMIT_REPORT",
               "TRAINING_SESSION", session_id)

    return MessageResponse(message="Report submitted successfully")


@router.post("/coach-reviews", response_model=ReviewResponse)
def create_review(
    body: CreateReviewRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Player leaves a review for a coach after a session."""
    if body.rating < 1 or body.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    session = db.query(TrainingSession).filter(
        TrainingSession.id == body.training_session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    review = CoachReview(
        training_session_id=body.training_session_id,
        player_profile_id=profile.id if profile else None,
        coach_profile_id=session.coach_profile_id,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    log_action(db, current_user.user_id, current_user.role, "CREATE_REVIEW",
               "COACH_REVIEW", review.id)

    return ReviewResponse(
        id=review.id,
        training_session_id=review.training_session_id,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


@router.get("/coach/{coach_id}/reviews", response_model=list[ReviewResponse])
def coach_reviews(
    coach_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all reviews for a specific coach."""
    reviews = db.query(CoachReview).filter(
        CoachReview.coach_profile_id == coach_id,
    ).order_by(CoachReview.created_at.desc()).all()

    return [
        ReviewResponse(
            id=r.id,
            training_session_id=r.training_session_id,
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
        )
        for r in reviews
    ]

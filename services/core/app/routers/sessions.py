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

    return [
        TrainingSessionResponse(
            id=s.id,
            training_request_id=s.training_request_id,
            coach_profile_id=s.coach_profile_id,
            scheduled_at=s.scheduled_at,
            duration_minutes=s.duration_minutes,
            status=s.status.value,
            report=s.report,
            created_at=s.created_at,
        )
        for s in sessions
    ]


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

    if body.action == "CANCEL":
        session.status = SessionStatus.CANCELLED
        log_action(db, current_user.user_id, current_user.role, "CANCEL_SESSION",
                   "TRAINING_SESSION", session_id)

    elif body.action == "COMPLETE":
        session.status = SessionStatus.COMPLETED
        log_action(db, current_user.user_id, current_user.role, "COMPLETE_SESSION",
                   "TRAINING_SESSION", session_id)

    elif body.action == "RESCHEDULE":
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

        return TrainingSessionResponse(
            id=new_session.id,
            training_request_id=new_session.training_request_id,
            coach_profile_id=new_session.coach_profile_id,
            scheduled_at=new_session.scheduled_at,
            duration_minutes=new_session.duration_minutes,
            status=new_session.status.value,
            report=new_session.report,
            created_at=new_session.created_at,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    db.commit()
    db.refresh(session)

    return TrainingSessionResponse(
        id=session.id,
        training_request_id=session.training_request_id,
        coach_profile_id=session.coach_profile_id,
        scheduled_at=session.scheduled_at,
        duration_minutes=session.duration_minutes,
        status=session.status.value,
        report=session.report,
        created_at=session.created_at,
    )


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

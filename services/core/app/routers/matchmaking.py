import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.models import (
    PlayerProfile, CoachProfile, TrainingRequest, TrainingSession,
    RequestStatus, SessionStatus,
)
from app.schemas import (
    CreateTrainingRequest, PatchTrainingRequest,
    TrainingRequestResponse, TrainingSessionResponse,
)

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])


@router.post("/requests", response_model=TrainingRequestResponse)
async def create_request(
    body: CreateTrainingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new training request and invoke ML matching."""
    if current_user.role != "PLAYER":
        raise HTTPException(status_code=403, detail="Only players can create training requests")

    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile:
        profile = PlayerProfile(core_user_id=current_user.user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    # Create request
    req = TrainingRequest(
        player_profile_id=profile.id,
        desired_role=body.desired_role,
        focus_area=body.focus_area,
        status=RequestStatus.NEW,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Call ML service with real coach data
    try:
        # Fetch all coaches to send to ML for scoring
        all_coaches = db.query(CoachProfile).all()
        coaches_payload = [
            {
                "id": c.id,
                "mmr_estimate": c.mmr_estimate,
                "main_roles": c.main_roles,
                "hero_pool": c.hero_pool,
                "hourly_rate": c.hourly_rate,
                "experience_years": c.experience_years,
            }
            for c in all_coaches
        ]

        ml_payload = {
            "player_profile": {
                "player_profile_id": profile.id,
                "steam_id": profile.steam_id,
                "dota_account_id": profile.dota_account_id,
                "actual_rank_tier": profile.actual_rank_tier,
                "actual_roles": profile.actual_roles,
                "desired_rank_tier": profile.desired_rank_tier,
                "desired_roles": profile.desired_roles,
                "training_goals": profile.training_goals,
            },
            "request": {
                "training_request_id": req.id,
                "desired_role": body.desired_role,
                "focus_area": body.focus_area,
                "use_ai_coach": body.use_ai_coach,
            },
            "coaches": coaches_payload,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{settings.ML_SERVICE_URL}/ml/match-coaches", json=ml_payload)

        if resp.status_code == 200:
            data = resp.json()
            req.ml_analysis_id = data.get("ml_analysis_id")
            req.recommended_coaches = data.get("recommended_coaches")
            req.status = RequestStatus.WAITING_CONFIRMATION
        else:
            req.status = RequestStatus.MATCHING

    except Exception:
        req.status = RequestStatus.MATCHING

    db.commit()
    db.refresh(req)

    log_action(db, current_user.user_id, current_user.role, "CREATE_REQUEST",
               "TRAINING_REQUEST", req.id)

    return TrainingRequestResponse(
        id=req.id,
        player_profile_id=req.player_profile_id,
        desired_role=req.desired_role,
        focus_area=req.focus_area,
        status=req.status.value,
        ml_analysis_id=req.ml_analysis_id,
        recommended_coaches=req.recommended_coaches,
        created_at=req.created_at,
    )


@router.get("/requests/my", response_model=list[TrainingRequestResponse])
def my_requests(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List current player's training requests."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile:
        return []

    requests = db.query(TrainingRequest).filter(
        TrainingRequest.player_profile_id == profile.id,
    ).order_by(TrainingRequest.created_at.desc()).all()

    return [
        TrainingRequestResponse(
            id=r.id,
            player_profile_id=r.player_profile_id,
            desired_role=r.desired_role,
            focus_area=r.focus_area,
            status=r.status.value,
            ml_analysis_id=r.ml_analysis_id,
            recommended_coaches=r.recommended_coaches,
            created_at=r.created_at,
        )
        for r in requests
    ]


@router.patch("/requests/{request_id}", response_model=TrainingRequestResponse)
def patch_request(
    request_id: int,
    body: PatchTrainingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a training request (choose coach or cancel)."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    req = db.query(TrainingRequest).filter(TrainingRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if profile and req.player_profile_id != profile.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Not your request")

    if body.action == "CANCEL":
        req.status = RequestStatus.CANCELLED
        db.commit()
        log_action(db, current_user.user_id, current_user.role, "CANCEL_REQUEST",
                   "TRAINING_REQUEST", req.id)

    elif body.action == "CHOOSE_COACH":
        if req.status != RequestStatus.WAITING_CONFIRMATION:
            raise HTTPException(status_code=400, detail="Request not in WAITING_CONFIRMATION status")
        if not body.chosen_coach_profile_id:
            raise HTTPException(status_code=400, detail="Coach profile ID required")

        session = TrainingSession(
            training_request_id=req.id,
            coach_profile_id=body.chosen_coach_profile_id,
            scheduled_at=body.scheduled_at,
            duration_minutes=60,
            status=SessionStatus.PLANNED,
        )
        db.add(session)
        req.status = RequestStatus.ACCEPTED
        db.commit()

        log_action(db, current_user.user_id, current_user.role, "CREATE_SESSION",
                   "TRAINING_SESSION", session.id)

    db.refresh(req)
    return TrainingRequestResponse(
        id=req.id,
        player_profile_id=req.player_profile_id,
        desired_role=req.desired_role,
        focus_area=req.focus_area,
        status=req.status.value,
        ml_analysis_id=req.ml_analysis_id,
        recommended_coaches=req.recommended_coaches,
        created_at=req.created_at,
    )

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import (
    PlayerProfile, CoachProfile, TrainingRequest, TrainingSession, CoreUser,
    RequestStatus, SessionStatus,
)
from app.schemas import (
    CreateTrainingRequest, PatchTrainingRequest,
    TrainingRequestResponse, TrainingSessionResponse,
)

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])

HIDE_TEST_COACHES = os.getenv("HIDE_TEST_COACHES", "true").lower() in ("true", "1", "yes")
TEST_COACH_AUTH_IDS = {
    int(v.strip()) for v in os.getenv("TEST_COACH_AUTH_IDS", "4,5").split(",") if v.strip().isdigit()
}
ACTIVE_REQUEST_STATUSES = (
    RequestStatus.NEW,
    RequestStatus.MATCHING,
    RequestStatus.WAITING_CONFIRMATION,
    RequestStatus.ACCEPTED,
)


def _coach_label(coach: CoachProfile | None) -> str | None:
    if not coach:
        return None
    title = (coach.about or "").splitlines()[0].strip()
    return title or f"Тренер #{coach.id}"


def _player_label(player: PlayerProfile | None) -> str | None:
    if not player:
        return None
    if player.dota_account_id:
        return f"Игрок {player.dota_account_id}"
    return f"Игрок #{player.id}"


def _available_coaches(db: Session):
    query = db.query(CoachProfile).join(CoreUser, CoreUser.id == CoachProfile.core_user_id)
    if HIDE_TEST_COACHES and TEST_COACH_AUTH_IDS:
        query = query.filter(~CoreUser.auth_user_id.in_(TEST_COACH_AUTH_IDS))
    query = query.filter(
        CoachProfile.about.isnot(None),
        CoachProfile.hourly_rate.isnot(None),
        CoachProfile.mmr_estimate.isnot(None),
    )
    return query.order_by(CoachProfile.id.desc()).all()


def _coach_id_from_request(req: TrainingRequest) -> int | None:
    for item in req.recommended_coaches or []:
        if isinstance(item, dict) and item.get("coach_profile_id"):
            return item.get("coach_profile_id")
    return None


def _request_response(req: TrainingRequest, db: Session | None = None) -> TrainingRequestResponse:
    player = None
    coach = None
    recommended = req.recommended_coaches

    if db:
        player = db.query(PlayerProfile).filter(PlayerProfile.id == req.player_profile_id).first()
        coach_id = _coach_id_from_request(req)
        if coach_id:
            coach = db.query(CoachProfile).filter(CoachProfile.id == coach_id).first()
        if recommended:
            recommended = []
            for item in req.recommended_coaches or []:
                if not isinstance(item, dict):
                    recommended.append(item)
                    continue
                enriched = dict(item)
                item_coach = None
                item_coach_id = item.get("coach_profile_id")
                if item_coach_id:
                    item_coach = db.query(CoachProfile).filter(CoachProfile.id == item_coach_id).first()
                if item_coach:
                    enriched.update({
                        "coach_label": _coach_label(item_coach),
                        "coach_core_user_id": item_coach.core_user_id,
                        "rank_tier": item_coach.rank_tier,
                        "mmr_estimate": item_coach.mmr_estimate,
                        "hourly_rate": item_coach.hourly_rate,
                    })
                recommended.append(enriched)

    return TrainingRequestResponse(
        id=req.id,
        player_profile_id=req.player_profile_id,
        player_core_user_id=player.core_user_id if player else None,
        player_label=_player_label(player),
        player_dota_account_id=player.dota_account_id if player else None,
        player_actual_rank_tier=player.actual_rank_tier if player else None,
        desired_role=req.desired_role,
        focus_area=req.focus_area,
        status=req.status.value,
        ml_analysis_id=req.ml_analysis_id,
        recommended_coaches=recommended,
        coach_profile_id=coach.id if coach else None,
        coach_core_user_id=coach.core_user_id if coach else None,
        coach_label=_coach_label(coach),
        coach_rank_tier=coach.rank_tier if coach else None,
        coach_mmr_estimate=coach.mmr_estimate if coach else None,
        coach_hourly_rate=coach.hourly_rate if coach else None,
        created_at=req.created_at,
    )


def _recommended_has_coach(req: TrainingRequest, coach_id: int | None) -> bool:
    if not coach_id:
        return False
    for item in req.recommended_coaches or []:
        if isinstance(item, dict) and item.get("coach_profile_id") == coach_id:
            return True
    return False


def _has_session_for_request(db: Session, request_id: int) -> bool:
    return db.query(TrainingSession).filter(
        TrainingSession.training_request_id == request_id,
    ).first() is not None


def _find_existing_active_request(db: Session, profile_id: int, body: CreateTrainingRequest) -> TrainingRequest | None:
    query = db.query(TrainingRequest).filter(
        TrainingRequest.player_profile_id == profile_id,
        TrainingRequest.status.in_(ACTIVE_REQUEST_STATUSES),
        TrainingRequest.desired_role.is_(None) if body.desired_role is None else TrainingRequest.desired_role == body.desired_role,
        TrainingRequest.focus_area.is_(None) if body.focus_area is None else TrainingRequest.focus_area == body.focus_area,
    ).order_by(TrainingRequest.created_at.desc())

    for req in query.limit(20).all():
        if body.preferred_coach_profile_id:
            if _recommended_has_coach(req, body.preferred_coach_profile_id):
                return req
            continue
        # For generic matching requests, reuse the active request with same
        # role/focus regardless of recommendation contents.
        return req
    return None


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

    existing_req = _find_existing_active_request(db, profile.id, body)
    if existing_req:
        log_action(
            db, current_user.user_id, current_user.role, "REUSE_REQUEST",
            "TRAINING_REQUEST", existing_req.id,
        )
        return _request_response(existing_req, db)

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

    # Shortcut: if the player applied to a specific coach (e.g. clicked
    # "Записаться" on a coach card), skip ML matching and pre-fill that coach
    # as the sole recommendation. The coach can confirm/decline from their
    # schedule. We also stash the player's optional ``message`` so the coach
    # has context when reviewing the application.
    if body.preferred_coach_profile_id:
        preferred = db.query(CoachProfile).filter(
            CoachProfile.id == body.preferred_coach_profile_id,
            CoachProfile.is_verified == True,  # noqa: E712
        ).first()
        if preferred:
            req.recommended_coaches = [{
                "coach_profile_id": preferred.id,
                "score": 1.0,
                "reasons": ["Выбран игроком напрямую"],
                "message": (body.message or "").strip() or None,
                "direct_application": True,
            }]
            req.status = RequestStatus.WAITING_CONFIRMATION
            db.commit()
            db.refresh(req)
            log_action(
                db, current_user.user_id, current_user.role, "CREATE_REQUEST_DIRECT",
                "TRAINING_REQUEST", req.id, {"coach_profile_id": preferred.id},
            )
            return _request_response(req, db)

    # Otherwise run the ML matcher as usual.
    try:
        # Fetch all available coaches to send to ML for scoring
        all_coaches = _available_coaches(db)
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
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/match-coaches",
                json=ml_payload,
                headers=ml_headers(),
            )

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

    return _request_response(req, db)


@router.post("/recommend-preview")
async def recommend_preview(
    body: CreateTrainingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview coach recommendations without creating a training request."""
    if current_user.role != "PLAYER":
        raise HTTPException(status_code=403, detail="Only players can request recommendations")

    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile:
        profile = PlayerProfile(core_user_id=current_user.user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    all_coaches = _available_coaches(db)
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
            "training_request_id": None,
            "desired_role": body.desired_role,
            "focus_area": body.focus_area,
            "use_ai_coach": False,
        },
        "coaches": coaches_payload,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.ML_SERVICE_URL}/ml/match-coaches",
                json=ml_payload,
                headers=ml_headers(),
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"ML error: {resp.text}")
        data = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ML unavailable: {str(e)}")

    log_action(db, current_user.user_id, current_user.role, "PREVIEW_RECOMMENDATIONS",
               "PLAYER_PROFILE", profile.id)
    return {
        "recommended_coaches": data.get("recommended_coaches", []),
        "coaches_count": len(coaches_payload),
    }


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

    return [_request_response(r, db) for r in requests]


@router.get("/requests/coach", response_model=list[TrainingRequestResponse])
def coach_requests(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List pending training applications addressed to the current coach."""
    if current_user.role not in ("COACH", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only coaches can view coach requests")

    coach_profile = db.query(CoachProfile).filter(
        CoachProfile.core_user_id == current_user.user_id
    ).first()
    if not coach_profile:
        return []

    requests = db.query(TrainingRequest).filter(
        TrainingRequest.status == RequestStatus.WAITING_CONFIRMATION,
    ).order_by(TrainingRequest.created_at.desc()).all()

    visible = [
        r for r in requests
        if _recommended_has_coach(r, coach_profile.id) and not _has_session_for_request(db, r.id)
    ]
    return [_request_response(r, db) for r in visible]


@router.patch("/requests/{request_id}", response_model=TrainingRequestResponse)
def patch_request(
    request_id: int,
    body: PatchTrainingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a training request (choose/confirm coach, reject, or cancel)."""
    req = db.query(TrainingRequest).filter(TrainingRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if body.action == "CANCEL":
        profile = db.query(PlayerProfile).filter(
            PlayerProfile.core_user_id == current_user.user_id
        ).first()
        if current_user.role != "ADMIN" and (not profile or req.player_profile_id != profile.id):
            raise HTTPException(status_code=403, detail="Not your request")
        req.status = RequestStatus.CANCELLED
        db.commit()
        log_action(db, current_user.user_id, current_user.role, "CANCEL_REQUEST",
                   "TRAINING_REQUEST", req.id)

    elif body.action == "REJECT":
        coach_profile = db.query(CoachProfile).filter(
            CoachProfile.core_user_id == current_user.user_id
        ).first()
        if current_user.role != "ADMIN" and (
            not coach_profile or not _recommended_has_coach(req, coach_profile.id)
        ):
            raise HTTPException(status_code=403, detail="Not your coach request")
        req.status = RequestStatus.REJECTED
        db.commit()
        log_action(db, current_user.user_id, current_user.role, "REJECT_REQUEST",
                   "TRAINING_REQUEST", req.id)

    elif body.action == "CHOOSE_COACH":
        if req.status != RequestStatus.WAITING_CONFIRMATION:
            raise HTTPException(status_code=400, detail="Request not in WAITING_CONFIRMATION status")

        chosen_coach_id = body.chosen_coach_profile_id
        if current_user.role == "COACH":
            coach_profile = db.query(CoachProfile).filter(
                CoachProfile.core_user_id == current_user.user_id
            ).first()
            if not coach_profile or not _recommended_has_coach(req, coach_profile.id):
                raise HTTPException(status_code=403, detail="Not your coach request")
            chosen_coach_id = coach_profile.id
            if not body.scheduled_at:
                raise HTTPException(status_code=400, detail="scheduled_at required for coach confirmation")
        elif current_user.role != "ADMIN":
            profile = db.query(PlayerProfile).filter(
                PlayerProfile.core_user_id == current_user.user_id
            ).first()
            if not profile or req.player_profile_id != profile.id:
                raise HTTPException(status_code=403, detail="Not your request")

        if not chosen_coach_id:
            raise HTTPException(status_code=400, detail="Coach profile ID required")
        if not _recommended_has_coach(req, chosen_coach_id) and current_user.role != "ADMIN":
            raise HTTPException(status_code=400, detail="Coach is not attached to this request")
        if _has_session_for_request(db, req.id):
            raise HTTPException(status_code=400, detail="Session already exists for this request")

        session = TrainingSession(
            training_request_id=req.id,
            coach_profile_id=chosen_coach_id,
            scheduled_at=body.scheduled_at,
            duration_minutes=60,
            status=SessionStatus.PLANNED,
        )
        db.add(session)
        req.status = RequestStatus.ACCEPTED
        db.commit()

        log_action(db, current_user.user_id, current_user.role, "CREATE_SESSION",
                   "TRAINING_SESSION", session.id)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    db.refresh(req)
    return _request_response(req, db)

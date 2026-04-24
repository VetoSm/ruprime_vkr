import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import PlayerProfile, AiAdviceHistory
from app.schemas import AiChatRequest, AiChatResponse, AiHistoryEntry

router = APIRouter(prefix="/ai", tags=["ai-chat"])


@router.post("/chat", response_model=AiChatResponse)
async def ai_chat(
    body: AiChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a message to the AI coach and get advice."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()

    # Build context from ML data + detailed features
    context = {}
    if profile and profile.ml_analysis_id:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/player-analysis/{profile.ml_analysis_id}",
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                ml_data = resp.json()
                context = {
                    "summary": ml_data.get("summary", {}),
                    "weaknesses": ml_data.get("weaknesses_ranked", []),
                    "strengths": ml_data.get("strengths_ranked", []),
                }
        except Exception:
            pass

    # Add detailed feature gaps if account is linked
    if profile and profile.dota_account_id:
        try:
            params = {}
            if profile.desired_rank_tier:
                params["desired_rank"] = profile.desired_rank_tier
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/detailed-features/{profile.dota_account_id}",
                    params=params,
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                feat_data = resp.json()
                context["feature_gaps"] = feat_data.get("top_gaps", [])
                context["overall_score"] = feat_data.get("overall_score", 0)
        except Exception:
            pass

    # Call LLM service
    advice_summary = ""
    advice_full = ""
    llm_request_id = None

    try:
        llm_payload = {
            "message": body.message,
            "player_context": context,
            "player_profile_id": profile.id if profile else None,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{settings.LLM_SERVICE_URL}/llm/chat", json=llm_payload)
        if resp.status_code == 200:
            data = resp.json()
            advice_summary = data.get("summary", "")
            advice_full = data.get("full_text", "")
            llm_request_id = data.get("request_id")
    except Exception:
        advice_summary = "AI coach is temporarily unavailable."
        advice_full = "Please try again later. The AI coaching service is currently starting up."

    # Save to history
    history = AiAdviceHistory(
        player_profile_id=profile.id if profile else None,
        llm_request_id=llm_request_id,
        prompt_context=context,
        message=body.message,
        advice_summary=advice_summary,
        advice_full=advice_full,
    )
    db.add(history)
    db.commit()

    log_action(db, current_user.user_id, current_user.role, "AI_CHAT",
               "AI_ADVICE", history.id)

    return AiChatResponse(
        advice_summary=advice_summary,
        advice_full=advice_full,
        llm_request_id=llm_request_id,
    )


@router.get("/history", response_model=list[AiHistoryEntry])
def ai_history(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get AI chat history for the current player."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if not profile:
        return []

    entries = db.query(AiAdviceHistory).filter(
        AiAdviceHistory.player_profile_id == profile.id,
    ).order_by(AiAdviceHistory.created_at.desc()).limit(50).all()

    return [
        AiHistoryEntry(
            id=e.id,
            message=e.message,
            advice_summary=e.advice_summary,
            advice_full=e.advice_full,
            created_at=e.created_at,
        )
        for e in entries
    ]

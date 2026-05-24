import httpx
import os
from datetime import datetime, time, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser, log_action
from app.config import settings
from app.ml_client import ml_headers
from app.models import PlayerProfile, AiAdviceHistory, TrainingRequest, TrainingSession, SessionStatus
from app.schemas import AiChatRequest, AiChatResponse, AiHistoryEntry, MessageResponse

router = APIRouter(prefix="/ai", tags=["ai-chat"])

DEFAULT_AI_STATS_PARAMS = {"mode": "ranked", "period": "50"}
AI_CHAT_DAILY_LIMIT = max(1, int(os.getenv("AI_CHAT_DAILY_LIMIT", "20")))


def _today_usage(profile_id: int | None, db: Session) -> int:
    if not profile_id:
        return 0
    now = datetime.now(timezone.utc)
    day_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    return db.query(AiAdviceHistory).filter(
        AiAdviceHistory.player_profile_id == profile_id,
        AiAdviceHistory.created_at >= day_start,
    ).count()


def _limit_response(context: dict, used_today: int) -> AiChatResponse:
    summary = "Дневной лимит ИИ-коуча исчерпан."
    summary_data = context.get("summary", {}) if context else {}
    filters = context.get("filters_applied") or summary_data.get("filters_applied") or {}
    scope = filters.get("label") or summary_data.get("stats_scope_label") or "текущая выборка"
    winrate = summary_data.get("winrate")
    wr_text = f"{winrate:.1%}" if isinstance(winrate, (int, float)) else "нет данных"
    full = (
        f"{summary}\n\n"
        f"Сегодня доступно {AI_CHAT_DAILY_LIMIT} запросов, использовано: {used_today}.\n\n"
        "Краткая статистика без генерации:\n"
        f"- Выборка: {scope}\n"
        f"- Матчей: {summary_data.get('games_analyzed', 0)}\n"
        f"- Винрейт: {wr_text}\n"
        f"- MMR: {summary_data.get('estimated_mmr', 'нет данных')}\n"
        f"- Общий балл навыков: {context.get('overall_score', 'нет данных') if context else 'нет данных'}\n"
    )
    return AiChatResponse(
        advice_summary=summary,
        advice_full=full,
        context_basis=_context_basis(context),
        show_context_radar=used_today == 0,
        llm_status="rate_limited",
        llm_error="AI_CHAT_DAILY_LIMIT exceeded",
        requests_used_today=used_today,
        requests_limit_daily=AI_CHAT_DAILY_LIMIT,
        requests_remaining_today=0,
    )


def _desired_primary_role(profile: PlayerProfile) -> int | None:
    if profile and profile.analysis_role:
        digits = "".join(ch for ch in str(profile.analysis_role) if ch.isdigit())
        if digits:
            val = int(digits)
            if 1 <= val <= 5:
                return val
    roles = profile.desired_roles if profile else None
    if not roles:
        return None
    if isinstance(roles, str):
        candidates = [roles]
    elif isinstance(roles, list):
        candidates = roles
    else:
        return None
    for raw in candidates:
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if digits:
            val = int(digits)
            if 1 <= val <= 5:
                return val
    return None


def _context_basis(context: dict) -> dict:
    summary = context.get("summary", {}) if context else {}
    filters = context.get("filters_applied") or summary.get("filters_applied") or {}
    gaps = context.get("feature_gaps") or []
    categories = context.get("feature_categories") or []
    return {
        "scope": filters.get("label") or summary.get("stats_scope_label"),
        "matches": summary.get("games_analyzed"),
        "winrate": summary.get("winrate"),
        "mmr": summary.get("estimated_mmr"),
        "overall_score": context.get("overall_score"),
        "current_rank": context.get("current_rank"),
        "target_rank": context.get("target_rank"),
        "top_gaps": gaps[:5],
        "weak_categories": sorted(categories, key=lambda c: c.get("score", 0))[:4],
    }


def _training_context(profile: PlayerProfile | None, db: Session) -> dict:
    if not profile:
        return {}
    sessions = db.query(TrainingSession).join(
        TrainingRequest,
        TrainingRequest.id == TrainingSession.training_request_id,
    ).filter(
        TrainingRequest.player_profile_id == profile.id,
    ).order_by(TrainingSession.scheduled_at.desc().nullslast()).limit(20).all()
    planned = []
    completed = []
    for session in sessions:
        item = {
            "session_id": session.id,
            "coach_profile_id": session.coach_profile_id,
            "scheduled_at": session.scheduled_at.isoformat() if session.scheduled_at else None,
            "duration_minutes": session.duration_minutes,
            "status": session.status.value if session.status else None,
            "report_available": bool(session.report),
        }
        if session.status == SessionStatus.COMPLETED:
            completed.append(item)
        elif session.status == SessionStatus.PLANNED:
            planned.append(item)
    return {
        "profile": {
            "analysis_role": profile.analysis_role,
            "desired_roles": profile.desired_roles,
            "desired_rank_tier": profile.desired_rank_tier,
            "training_goals": profile.training_goals,
            "about": profile.about,
        },
        "sessions": {
            "planned": planned[:5],
            "completed": completed[:10],
            "planned_count": len(planned),
            "completed_count": len(completed),
        },
    }


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

    # Build context from current filtered ML data + detailed features. Do not
    # use the old cached ml_analysis_id here: the coach should comment on the
    # same current ranked window that the dashboard shows.
    context = {}
    if profile and profile.dota_account_id:
        params = dict(DEFAULT_AI_STATS_PARAMS)
        role = _desired_primary_role(profile)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{settings.ML_SERVICE_URL}/ml/analyze-player/{profile.dota_account_id}",
                    params={"player_profile_id": profile.id, **params},
                    headers=ml_headers(),
                )
            if resp.status_code == 200:
                ml_data = resp.json()
                context = {
                    "summary": ml_data.get("summary", {}),
                    "weaknesses": ml_data.get("weaknesses_ranked", []),
                    "strengths": ml_data.get("strengths_ranked", []),
                    "comparisons": ml_data.get("comparisons", {}),
                    "filters": {**params, **({"baseline_role": role} if role else {})},
                }
        except Exception:
            pass

    # Add detailed feature gaps if account is linked
    if profile and profile.dota_account_id:
        try:
            params = dict(DEFAULT_AI_STATS_PARAMS)
            role = _desired_primary_role(profile)
            if role:
                params["baseline_role"] = role
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
                context["feature_categories"] = feat_data.get("categories", [])
                context["filters_applied"] = feat_data.get("filters_applied")
                context["vision_data"] = feat_data.get("vision_data")
                context["current_rank"] = feat_data.get("current_rank")
                context["target_rank"] = feat_data.get("target_rank")
                context["current_band"] = feat_data.get("current_band")
                context["target_band"] = feat_data.get("target_band")
        except Exception:
            pass

    context["training"] = _training_context(profile, db)

    used_today = _today_usage(profile.id if profile else None, db)
    if used_today >= AI_CHAT_DAILY_LIMIT:
        return _limit_response(context, used_today)

    # Call LLM service
    advice_summary = ""
    advice_full = ""
    llm_request_id = None
    llm_status = None
    llm_error = None

    try:
        llm_payload = {
            "message": body.message,
            "player_context": context,
            "player_profile_id": profile.id if profile else None,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.LLM_SERVICE_URL}/llm/chat",
                json=llm_payload,
                headers=ml_headers(),
            )
        if resp.status_code == 200:
            data = resp.json()
            advice_summary = data.get("summary", "")
            advice_full = data.get("full_text", "")
            llm_request_id = data.get("request_id")
            llm_status = data.get("llm_status")
            llm_error = data.get("llm_error")
        else:
            advice_summary = "ИИ-коуч временно недоступен."
            advice_full = "LLM-сервис не смог обработать запрос. Попробуйте позже или проверьте настройки модели."
            llm_status = "unavailable"
            llm_error = f"LLM service returned HTTP {resp.status_code}"
    except Exception:
        advice_summary = "AI coach is temporarily unavailable."
        advice_full = "Please try again later. The AI coaching service is currently starting up."
        llm_status = "unavailable"
        llm_error = "LLM service request failed"

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
        context_basis=_context_basis(context),
        show_context_radar=used_today == 0,
        llm_request_id=llm_request_id,
        llm_status=llm_status,
        llm_error=llm_error,
        requests_used_today=used_today + 1,
        requests_limit_daily=AI_CHAT_DAILY_LIMIT,
        requests_remaining_today=max(AI_CHAT_DAILY_LIMIT - used_today - 1, 0),
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


@router.delete("/history", response_model=MessageResponse)
def clear_ai_history(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear AI chat history for the current player."""
    profile = db.query(PlayerProfile).filter(
        PlayerProfile.core_user_id == current_user.user_id
    ).first()
    if profile:
        db.query(AiAdviceHistory).filter(
            AiAdviceHistory.player_profile_id == profile.id,
        ).delete(synchronize_session=False)
        db.commit()
        log_action(db, current_user.user_id, current_user.role, "CLEAR_AI_HISTORY",
                   "AI_ADVICE", profile.id)
    return MessageResponse(message="History cleared")

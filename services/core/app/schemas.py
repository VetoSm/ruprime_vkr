from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


# ---- Player Profile ----
class PlayerProfileUpdate(BaseModel):
    desired_rank_tier: Optional[str] = None
    desired_roles: Optional[list[str]] = None
    training_goals: Optional[list[str]] = None
    about: Optional[str] = None


class PlayerProfileResponse(BaseModel):
    id: int
    core_user_id: int
    steam_id: Optional[str] = None
    dota_account_id: Optional[str] = None
    actual_rank_tier: Optional[str] = None
    actual_roles: Optional[Any] = None
    desired_rank_tier: Optional[str] = None
    desired_roles: Optional[Any] = None
    training_goals: Optional[Any] = None
    about: Optional[str] = None
    ml_analysis_id: Optional[str] = None

    class Config:
        from_attributes = True


# ---- Coach Profile ----
class CoachProfileUpdate(BaseModel):
    mmr_estimate: Optional[int] = None
    rank_tier: Optional[str] = None
    main_roles: Optional[list[str]] = None
    hero_pool: Optional[list[str]] = None
    hourly_rate: Optional[float] = None
    experience_years: Optional[int] = None
    about: Optional[str] = None


class CoachProfileResponse(BaseModel):
    id: int
    core_user_id: int
    mmr_estimate: Optional[int] = None
    rank_tier: Optional[str] = None
    main_roles: Optional[Any] = None
    hero_pool: Optional[Any] = None
    hourly_rate: Optional[float] = None
    experience_years: Optional[int] = None
    about: Optional[str] = None
    is_verified: bool = False
    # Auto-derived fallbacks: filled from the coach's own linked Steam history
    # when their profile is empty. Frontend uses these when the manual field
    # is null so a fresh coach still shows a meaningful card.
    auto_main_roles: Optional[list[str]] = None
    auto_hero_pool: Optional[list[str]] = None
    auto_rank_tier: Optional[str] = None
    auto_mmr_estimate: Optional[int] = None
    profile_complete: bool = True

    class Config:
        from_attributes = True


# ---- Training Requests ----
class CreateTrainingRequest(BaseModel):
    desired_role: Optional[str] = None
    focus_area: Optional[str] = None
    use_ai_coach: bool = False
    # When the player is applying to a specific coach (via /coaches catalog),
    # we record the coach up-front instead of running the ML matcher. The
    # request starts in WAITING_CONFIRMATION so the coach knows to react.
    preferred_coach_profile_id: Optional[int] = None
    message: Optional[str] = None


class PatchTrainingRequest(BaseModel):
    action: str  # CHOOSE_COACH or CANCEL
    chosen_coach_profile_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None


class TrainingRequestResponse(BaseModel):
    id: int
    player_profile_id: int
    desired_role: Optional[str] = None
    focus_area: Optional[str] = None
    status: str
    ml_analysis_id: Optional[str] = None
    recommended_coaches: Optional[Any] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- Training Sessions ----
class PatchTrainingSession(BaseModel):
    action: str  # RESCHEDULE, CANCEL, COMPLETE
    scheduled_at: Optional[datetime] = None


class TrainingSessionResponse(BaseModel):
    id: int
    training_request_id: int
    coach_profile_id: int
    player_profile_id: Optional[int] = None
    player_core_user_id: Optional[int] = None
    coach_core_user_id: Optional[int] = None
    player_label: Optional[str] = None
    coach_label: Optional[str] = None
    request_status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: str
    report: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionReportRequest(BaseModel):
    report: str
    duration_minutes: Optional[int] = None


# ---- Reviews ----
class CreateReviewRequest(BaseModel):
    training_session_id: int
    rating: int
    comment: Optional[str] = None


class ReviewResponse(BaseModel):
    id: int
    training_session_id: int
    rating: int
    comment: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- AI Chat ----
class AiChatRequest(BaseModel):
    message: str
    context_mode: str = "AUTO"


class AiChatResponse(BaseModel):
    advice_summary: str
    advice_full: str
    llm_request_id: Optional[str] = None
    llm_status: Optional[str] = None
    llm_error: Optional[str] = None
    requests_used_today: Optional[int] = None
    requests_limit_daily: Optional[int] = None
    requests_remaining_today: Optional[int] = None


class AiHistoryEntry(BaseModel):
    id: int
    message: Optional[str] = None
    advice_summary: Optional[str] = None
    advice_full: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- Admin ----
class AdminUserResponse(BaseModel):
    id: int
    auth_user_id: int
    role: Optional[str] = None
    email: Optional[str] = None
    login: Optional[str] = None
    is_active: Optional[bool] = None

    class Config:
        from_attributes = True


class AdminPatchUser(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ActionLogResponse(BaseModel):
    id: int
    core_user_id: Optional[int] = None
    role: Optional[str] = None
    action_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    total_users: int
    players: int
    coaches: int
    admins: int
    active_requests: int
    total_sessions: int
    planned_sessions: int = 0
    completed_sessions: int = 0
    cancelled_sessions: int = 0
    avg_coach_rating: Optional[float] = None


class AdminProfileBrief(BaseModel):
    id: int
    core_user_id: int
    auth_user_id: Optional[int] = None
    profile_type: str
    rank_or_mmr: Optional[str] = None
    roles: Optional[Any] = None
    about: Optional[str] = None
    sessions_total: int = 0
    sessions_completed: int = 0
    is_verified: Optional[bool] = None


class AdminProfilesResponse(BaseModel):
    players: list[AdminProfileBrief]
    coaches: list[AdminProfileBrief]


class MeOverviewResponse(BaseModel):
    role: str
    profile: Optional[Any] = None
    stats: Optional[Any] = None


class MessageResponse(BaseModel):
    message: str

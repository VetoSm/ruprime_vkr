from pydantic import BaseModel
from typing import Optional, Any


class LoadKaggleRequest(BaseModel):
    directory_path: str


class LoadKaggleResponse(BaseModel):
    status: str
    files_processed: list[dict[str, Any]]


class LoadConstantsResponse(BaseModel):
    status: str
    heroes_loaded: int
    items_loaded: int
    abilities_loaded: int


class ComputeBaselinesResponse(BaseModel):
    status: str
    baselines_computed: int


class PlayerProfileInput(BaseModel):
    player_profile_id: Optional[int] = None
    steam_id: Optional[str] = None
    dota_account_id: Optional[str] = None
    actual_rank_tier: Optional[str] = None
    actual_roles: Optional[Any] = None  # can be list or dict
    desired_rank_tier: Optional[str] = None
    desired_roles: Optional[Any] = None  # can be list or dict
    training_goals: Optional[Any] = None


class MatchRequestInput(BaseModel):
    training_request_id: Optional[int] = None
    desired_role: Optional[str] = None
    focus_area: Optional[str] = None
    use_ai_coach: bool = False


class CoachInput(BaseModel):
    id: int
    mmr_estimate: Optional[int] = None
    main_roles: Optional[list[str]] = None
    hero_pool: Optional[list[str]] = None
    hourly_rate: Optional[float] = None
    experience_years: Optional[int] = None


class MatchCoachesRequest(BaseModel):
    player_profile: PlayerProfileInput
    request: MatchRequestInput
    coaches: Optional[list[CoachInput]] = None


class CoachRecommendation(BaseModel):
    coach_profile_id: int
    score: float
    reasons: list[str]


class AiCoachSuggestion(BaseModel):
    summary: str
    plan: list[str]


class MatchCoachesResponse(BaseModel):
    ml_analysis_id: str
    player_assessment: dict[str, Any]
    recommended_coaches: list[CoachRecommendation]
    ai_coach_suggestion: Optional[AiCoachSuggestion] = None


class PlayerAnalysisResponse(BaseModel):
    ml_analysis_id: str
    summary: Optional[dict] = None
    trends: Optional[dict] = None
    roles: Optional[dict] = None
    heroes: Optional[dict] = None
    comparisons: Optional[dict] = None
    features: Optional[dict] = None
    weaknesses_ranked: Optional[list] = None
    strengths_ranked: Optional[list] = None


class HeroResponse(BaseModel):
    hero_id: int
    name: Optional[str] = None
    localized_name: Optional[str] = None
    primary_attr: Optional[str] = None
    attack_type: Optional[str] = None
    roles: Optional[str] = None
    img: Optional[str] = None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    message: str

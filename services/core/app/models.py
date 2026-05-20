from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float,
    Enum as SAEnum, JSON
)
from sqlalchemy.sql import func
import enum

from app.database import Base


class RequestStatus(str, enum.Enum):
    NEW = "NEW"
    MATCHING = "MATCHING"
    WAITING_CONFIRMATION = "WAITING_CONFIRMATION"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class SessionStatus(str, enum.Enum):
    PLANNED = "PLANNED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    RESCHEDULED = "RESCHEDULED"


class CoreUser(Base):
    __tablename__ = "core_users"

    id = Column(Integer, primary_key=True, index=True)
    auth_user_id = Column(Integer, unique=True, nullable=False, index=True)
    preferred_language = Column(String(10), nullable=True)
    time_zone = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlayerProfile(Base):
    __tablename__ = "player_profiles"

    id = Column(Integer, primary_key=True, index=True)
    core_user_id = Column(Integer, ForeignKey("core_users.id", ondelete="CASCADE"), unique=True, index=True)
    steam_id = Column(String(100), nullable=True, index=True)
    dota_account_id = Column(String(100), nullable=True)
    actual_rank_tier = Column(String(50), nullable=True)
    actual_roles = Column(JSON, nullable=True)
    desired_rank_tier = Column(String(50), nullable=True)
    desired_roles = Column(JSON, nullable=True)
    analysis_role = Column(String(20), nullable=True)
    training_goals = Column(JSON, nullable=True)
    about = Column(Text, nullable=True)
    ml_analysis_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CoachProfile(Base):
    __tablename__ = "coach_profiles"

    id = Column(Integer, primary_key=True, index=True)
    core_user_id = Column(Integer, ForeignKey("core_users.id", ondelete="CASCADE"), unique=True, index=True)
    mmr_estimate = Column(Integer, nullable=True)
    rank_tier = Column(String(50), nullable=True)
    main_roles = Column(JSON, nullable=True)
    hero_pool = Column(JSON, nullable=True)
    hourly_rate = Column(Float, nullable=True)
    experience_years = Column(Integer, nullable=True)
    about = Column(Text, nullable=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TrainingRequest(Base):
    __tablename__ = "training_requests"

    id = Column(Integer, primary_key=True, index=True)
    player_profile_id = Column(Integer, ForeignKey("player_profiles.id", ondelete="CASCADE"), index=True)
    desired_role = Column(String(20), nullable=True)
    focus_area = Column(String(100), nullable=True)
    ml_analysis_id = Column(String(100), nullable=True)
    status = Column(
        SAEnum(RequestStatus, name="request_status_enum", create_type=True),
        default=RequestStatus.NEW,
    )
    recommended_coaches = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id = Column(Integer, primary_key=True, index=True)
    training_request_id = Column(Integer, ForeignKey("training_requests.id", ondelete="CASCADE"), index=True)
    coach_profile_id = Column(Integer, ForeignKey("coach_profiles.id", ondelete="CASCADE"), index=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    status = Column(
        SAEnum(SessionStatus, name="session_status_enum", create_type=True),
        default=SessionStatus.PLANNED,
    )
    report = Column(Text, nullable=True)
    rescheduled_from_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TrainingContactExchange(Base):
    __tablename__ = "training_contact_exchanges"

    id = Column(Integer, primary_key=True, index=True)
    training_session_id = Column(Integer, ForeignKey("training_sessions.id", ondelete="CASCADE"), unique=True, index=True)
    requested_by = Column(JSON, nullable=True)
    player_contact = Column(JSON, nullable=True)
    coach_contact = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CoachReview(Base):
    __tablename__ = "coach_reviews"

    id = Column(Integer, primary_key=True, index=True)
    training_session_id = Column(Integer, ForeignKey("training_sessions.id", ondelete="CASCADE"), index=True)
    player_profile_id = Column(Integer, ForeignKey("player_profiles.id"), nullable=True)
    coach_profile_id = Column(Integer, ForeignKey("coach_profiles.id"), nullable=True)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiAdviceHistory(Base):
    __tablename__ = "ai_advice_history"

    id = Column(Integer, primary_key=True, index=True)
    player_profile_id = Column(Integer, ForeignKey("player_profiles.id", ondelete="CASCADE"), index=True)
    training_request_id = Column(Integer, ForeignKey("training_requests.id"), nullable=True)
    llm_request_id = Column(String(100), nullable=True)
    prompt_context = Column(JSON, nullable=True)
    message = Column(Text, nullable=True)
    advice_summary = Column(Text, nullable=True)
    advice_full = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CoreActionLog(Base):
    __tablename__ = "core_action_logs"

    id = Column(Integer, primary_key=True, index=True)
    core_user_id = Column(Integer, ForeignKey("core_users.id"), nullable=True)
    role = Column(String(20), nullable=True)
    action_type = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=True)
    entity_id = Column(Integer, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

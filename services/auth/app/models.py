from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.sql import func
import enum

from app.database import Base


class RoleEnum(str, enum.Enum):
    PLAYER = "PLAYER"
    COACH = "COACH"
    ADMIN = "ADMIN"


class CoachApplicationStatus(str, enum.Enum):
    """Lifecycle of a user's "I want to be a coach" request.

    NONE      — user never asked, or is already COACH.
    PENDING   — user submitted the request; admin (tech account) has not
                reviewed it yet. The user keeps role=PLAYER in the meantime
                so the UI shows them player-side.
    APPROVED  — admin accepted; role was flipped to COACH as a side effect.
    REJECTED  — admin declined. Status may be reset to NONE to allow retry.
    """

    NONE = "NONE"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AuthUser(Base):
    __tablename__ = "auth_users"

    id = Column(Integer, primary_key=True, index=True)
    login = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(RoleEnum, name="role_enum", create_type=True), default=RoleEnum.PLAYER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    coach_application_status = Column(
        SAEnum(CoachApplicationStatus, name="coach_application_status_enum", create_type=True),
        default=CoachApplicationStatus.NONE,
        nullable=False,
    )
    coach_application_requested_at = Column(DateTime(timezone=True), nullable=True)
    coach_approved_at = Column(DateTime(timezone=True), nullable=True)
    # Tracks acceptance of the Terms of Use + Privacy Policy. We store
    # the version string (e.g. "2026-04-24") so we can prompt for a new
    # consent if the document is updated later.
    consent_version = Column(String(32), nullable=True)
    consent_accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token = Column(String(512), unique=True, nullable=False, index=True)
    user_agent = Column(String(512), nullable=True)
    ip_address = Column(String(45), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuthRole(Base):
    __tablename__ = "auth_roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuthProvider(Base):
    __tablename__ = "auth_providers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)  # STEAM
    provider_user_id = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

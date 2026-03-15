import os
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, JSON, create_engine
)
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.sql import func

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://dota_coach:dota_coach_secret_2026@localhost:5432/dota_coach_db")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class LlmRequest(Base):
    __tablename__ = "llm_requests"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(100), unique=True, index=True)
    player_profile_id = Column(Integer, nullable=True)
    message = Column(Text, nullable=True)
    player_context = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LlmResponse(Base):
    __tablename__ = "llm_responses"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(100), index=True)
    summary = Column(Text, nullable=True)
    plan = Column(JSON, nullable=True)
    full_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

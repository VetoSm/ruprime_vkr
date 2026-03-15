from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.models import (  # noqa: F401
    CoreUser, PlayerProfile, CoachProfile,
    TrainingRequest, TrainingSession, CoachReview,
    AiAdviceHistory, CoreActionLog,
)
from app.routers.me import router as me_router
from app.routers.player import router as player_router
from app.routers.coach import router as coach_router
from app.routers.matchmaking import router as matchmaking_router
from app.routers.stats import router as stats_router
from app.routers.ai_chat import router as ai_chat_router
from app.routers.admin import router as admin_router
from app.routers.sessions import router as sessions_router

app = FastAPI(title="Dota2 Coach - Core Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me_router)
app.include_router(player_router)
app.include_router(coach_router)
app.include_router(matchmaking_router)
app.include_router(stats_router)
app.include_router(ai_chat_router)
app.include_router(admin_router)
app.include_router(sessions_router)


@app.on_event("startup")
def startup():
    import os
    Base.metadata.create_all(bind=engine)

    seed = os.getenv("SEED_TEST_DATA", "true").lower()
    if seed in ("true", "1", "yes"):
        from sqlalchemy.orm import Session as DBSession
        from app.seed_test_data import seed_test_profiles
        with DBSession(engine) as db:
            seed_test_profiles(db)


@app.get("/health")
def health():
    return {"status": "ok", "service": "core"}

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session as DBSession

from app.database import engine, Base
from app.models import (  # noqa: F401
    CoreUser, PlayerProfile, CoachProfile,
    TrainingRequest, TrainingSession, CoachReview,
    TrainingContactExchange, AiAdviceHistory, CoreActionLog,
)
from app.routers.me import router as me_router
from app.routers.player import router as player_router
from app.routers.coach import router as coach_router
from app.routers.matchmaking import router as matchmaking_router
from app.routers.stats import router as stats_router
from app.routers.ai_chat import router as ai_chat_router
from app.routers.admin import router as admin_router
from app.routers.sessions import router as sessions_router
from app.routers.public import router as public_router
from app.routers.ml_proxy import router as ml_proxy_router

# Auto-generated /docs and /redoc are great for local dev but leak the
# full API schema in production. Gate them behind ENABLE_API_DOCS so the
# default deploy ships without them; flip the env var to debug schemas
# from the staging box.
_DOCS_ENABLED = os.getenv("ENABLE_API_DOCS", "false").lower() in ("true", "1", "yes")
app = FastAPI(
    title="Dota2 Coach - Core Service",
    version="1.0.0",
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)

cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
app.include_router(public_router)
app.include_router(ml_proxy_router)


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_player_profiles_steam_id_nonempty "
            "ON player_profiles (steam_id) "
            "WHERE steam_id IS NOT NULL AND steam_id <> ''"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_player_profiles_dota_account_id_nonempty "
            "ON player_profiles (dota_account_id) "
            "WHERE dota_account_id IS NOT NULL AND dota_account_id <> ''"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_training_requests_active_same_scope "
            "ON training_requests ("
            "player_profile_id, "
            "COALESCE(desired_role, ''), "
            "COALESCE(focus_area, '')"
            ") "
            "WHERE status IN ("
            "'NEW'::request_status_enum, "
            "'MATCHING'::request_status_enum, "
            "'WAITING_CONFIRMATION'::request_status_enum, "
            "'ACCEPTED'::request_status_enum"
            ")"
        ))
        conn.execute(text(
            "ALTER TABLE player_profiles "
            "ADD COLUMN IF NOT EXISTS analysis_role VARCHAR(20)"
        ))

    invalidate_stats = os.getenv("INVALIDATE_ML_ANALYSES_ON_START", "true").lower()
    if invalidate_stats in ("true", "1", "yes"):
        with DBSession(engine) as db:
            db.query(PlayerProfile).filter(PlayerProfile.ml_analysis_id.isnot(None)).update(
                {PlayerProfile.ml_analysis_id: None},
                synchronize_session=False,
            )
            db.commit()

    seed = os.getenv("SEED_TEST_DATA", "false").lower()
    if seed in ("true", "1", "yes"):
        from app.seed_test_data import seed_test_profiles
        with DBSession(engine) as db:
            seed_test_profiles(db)


@app.get("/health")
def health():
    return {"status": "ok", "service": "core"}

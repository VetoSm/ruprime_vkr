import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from sqlalchemy import text
from app.internal_auth import require_internal_token
from app.models import (  # noqa: F401
    MlRawMatch, MlRawPlayer, MlRawTeam, MlRawPicksBans,
    MlConstantHero, MlConstantItem, MlConstantAbility,
    MlKaggleBaseline, MlPlayerAnalysis,
    PlayerAccount, PlayerMatch,
)
from app.routers.admin import router as admin_router
from app.routers.analysis import router as analysis_router
from app.routers.matching import router as matching_router
from app.routers.data_view import router as data_view_router

app = FastAPI(title="Dota2 Coach - ML Service", version="1.0.0")

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

# Every application route on the ML service is considered internal-only.
# Callers (core, llm) must provide X-Internal-Token. /health is the only
# exception and is declared without this dependency below.
_internal_deps = [Depends(require_internal_token)]

app.include_router(admin_router, dependencies=_internal_deps)
app.include_router(analysis_router, dependencies=_internal_deps)
app.include_router(matching_router, dependencies=_internal_deps)
app.include_router(data_view_router, dependencies=_internal_deps)


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
        conn.execute(text("ALTER TABLE player_matches ADD COLUMN IF NOT EXISTS obs_placed INTEGER"))
        conn.execute(text("ALTER TABLE player_matches ADD COLUMN IF NOT EXISTS sen_placed INTEGER"))

    # Mount images if available
    images_path = os.path.join(os.getenv("KAGGLE_DATA_PATH", "/data/archive-2"), "Images")
    if os.path.isdir(images_path):
        app.mount("/ml/images", StaticFiles(directory=images_path), name="images")

    # Auto-start match collector if enabled
    auto_collect = os.getenv("AUTO_COLLECT_MATCHES", "true").lower()
    if auto_collect in ("true", "1", "yes"):
        from app.match_collector import start_collector
        start_collector()

    # Periodic background refresh of linked Steam accounts (24h by default).
    from app.auto_refresh import start as _start_auto_refresh
    _start_auto_refresh()


@app.get("/health")
def health():
    from app.match_collector import get_collector_status
    status = get_collector_status()
    return {
        "status": "ok",
        "service": "ml",
        "collector_running": status.get("running", False),
        "matches_collected": status.get("matches_collected_total", 0),
    }

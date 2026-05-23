import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.models import AuthUser, AuthSession, AuthRole, AuthProvider, RoleEnum  # noqa: F401
from app.routers.auth import router as auth_router
from app.routers.steam_auth import router as steam_auth_router

# /docs hidden by default — auth schema documents every internal route
# and is not needed in production. Re-enable via ENABLE_API_DOCS=true.
_DOCS_ENABLED = os.getenv("ENABLE_API_DOCS", "false").lower() in ("true", "1", "yes")
app = FastAPI(
    title="Dota2 Coach - Auth Service",
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

app.include_router(auth_router)
app.include_router(steam_auth_router, prefix="/auth")


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

    from sqlalchemy.orm import Session

    with Session(engine) as db:
        # Seed default roles
        for role_name, desc in [
            ("ADMIN", "Администратор системы"),
            ("PLAYER", "Игрок Dota 2"),
            ("COACH", "Тренер Dota 2"),
        ]:
            existing = db.query(AuthRole).filter(AuthRole.name == role_name).first()
            if not existing:
                db.add(AuthRole(name=role_name, description=desc))
        db.commit()

        # One-shot forced re-login: when FORCE_REVOKE_ALL_SESSIONS=true is set on
        # startup, mark every active refresh session as revoked so short-lived
        # access tokens expire on their own and refresh is impossible. This is
        # used during security rollouts (e.g. JWT payload change, shortened TTL)
        # to invalidate any previously issued credentials.
        force_revoke = os.getenv("FORCE_REVOKE_ALL_SESSIONS", "false").lower()
        if force_revoke in ("true", "1", "yes"):
            db.query(AuthSession).filter(AuthSession.revoked == False).update(  # noqa: E712
                {"revoked": True}
            )
            db.commit()

        # Seed test accounts if enabled
        seed = os.getenv("SEED_TEST_DATA", "false").lower()
        if seed in ("true", "1", "yes"):
            from app.seed_test_data import seed_test_accounts
            seed_test_accounts(db)


@app.get("/health")
def health():
    return {"status": "ok", "service": "auth"}

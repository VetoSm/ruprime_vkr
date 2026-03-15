import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.models import AuthUser, AuthSession, AuthRole, AuthProvider, RoleEnum  # noqa: F401
from app.routers.auth import router as auth_router

app = FastAPI(title="Dota2 Coach - Auth Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


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

        # Seed test accounts if enabled
        seed = os.getenv("SEED_TEST_DATA", "true").lower()
        if seed in ("true", "1", "yes"):
            from app.seed_test_data import seed_test_accounts
            seed_test_accounts(db)


@app.get("/health")
def health():
    return {"status": "ok", "service": "auth"}

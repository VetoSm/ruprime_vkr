"""
Seed test accounts with filled profiles.
Run on startup if SEED_TEST_DATA=true.
Creates: test player, test coach, test admin -- all with full profiles.
"""

import os
import logging

from sqlalchemy.orm import Session

from app.models import AuthUser, AuthProvider, RoleEnum
from app.security import hash_password

logger = logging.getLogger(__name__)

TEST_ACCOUNTS = [
    {
        "login": "admin",
        "email": "admin@dota.coach",
        "password": "admin1234",
        "role": RoleEnum.ADMIN,
    },
    {
        "login": "player_test",
        "email": "player@test.com",
        "password": "player1234",
        "role": RoleEnum.PLAYER,
        "steam_id": "76561198071234567",
    },
    {
        "login": "carry_main",
        "email": "carry@test.com",
        "password": "carry12345",
        "role": RoleEnum.PLAYER,
        "steam_id": "76561198099887766",
    },
    {
        "login": "coach_pro",
        "email": "coach@test.com",
        "password": "coach12345",
        "role": RoleEnum.COACH,
        "steam_id": "76561198055443322",
    },
    {
        "login": "coach_mid",
        "email": "coachmid@test.com",
        "password": "coach12345",
        "role": RoleEnum.COACH,
        "steam_id": "76561198044332211",
    },
]


def seed_test_accounts(db: Session):
    """Create test accounts if they don't exist."""
    created = 0
    for acc in TEST_ACCOUNTS:
        existing = db.query(AuthUser).filter(AuthUser.email == acc["email"]).first()
        if existing:
            continue

        user = AuthUser(
            login=acc["login"],
            email=acc["email"],
            password_hash=hash_password(acc["password"]),
            role=acc["role"],
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.flush()

        # Link steam if provided
        if acc.get("steam_id"):
            provider = AuthProvider(
                user_id=user.id,
                provider="STEAM",
                provider_user_id=acc["steam_id"],
            )
            db.add(provider)

        created += 1
        logger.info(f"Created test account: {acc['login']} ({acc['role'].value})")

    db.commit()
    logger.info(f"Seed complete: {created} new accounts created")
    return created

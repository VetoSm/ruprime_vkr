"""
Seed test profiles in core service.
Creates filled player/coach profiles for test accounts.
"""

import logging
from sqlalchemy.orm import Session
from app.models import CoreUser, PlayerProfile, CoachProfile

logger = logging.getLogger(__name__)

# auth_user_id -> profile data  (matches seed_test_data in auth)
TEST_PROFILES = {
    # admin (auth_user_id=1) -- no special profile needed
    1: {"type": "admin"},
    # player_test (auth_user_id=2)
    2: {
        "type": "player",
        "steam_id": "76561198071234567",
        "dota_account_id": "110968839",
        "actual_rank_tier": "DIVINE",
        "actual_roles": {"POS4": 0.5, "POS5": 0.3, "POS3": 0.2},
        "desired_rank_tier": "IMMORTAL",
        "desired_roles": ["POS2", "POS4"],
        "training_goals": ["контроль линии", "пул героев мид", "макро"],
        "about": "Играю саппортов, хочу перейти в мид. 4200 MMR, 3000+ часов в Dota 2. Люблю Invoker и Storm Spirit.",
    },
    # carry_main (auth_user_id=3)
    3: {
        "type": "player",
        "steam_id": "76561198099887766",
        "dota_account_id": "139622038",
        "actual_rank_tier": "LEGEND",
        "actual_roles": {"POS1": 0.7, "POS2": 0.2, "POS3": 0.1},
        "desired_rank_tier": "ANCIENT",
        "desired_roles": ["POS1"],
        "training_goals": ["фарм паттерны", "позиционирование в тимфайтах", "выбор предметов"],
        "about": "Керри мейн, играю на Juggernaut, Phantom Assassin, Faceless Void. 3200 MMR.",
    },
    # coach_pro (auth_user_id=4)
    4: {
        "type": "coach",
        "mmr_estimate": 7500,
        "rank_tier": "IMMORTAL",
        "main_roles": ["POS1", "POS2"],
        "hero_pool": ["Invoker", "Storm Spirit", "Shadow Fiend", "Morphling", "Anti-Mage"],
        "hourly_rate": 25.0,
        "experience_years": 5,
        "about": "Экс-профессиональный игрок, тренирую 5 лет. Специализация — керри и мид. Помогу поднять MMR на 1000+ за месяц.",
    },
    # coach_mid (auth_user_id=5)
    5: {
        "type": "coach",
        "mmr_estimate": 6800,
        "rank_tier": "DIVINE",
        "main_roles": ["POS2", "POS4"],
        "hero_pool": ["Puck", "Queen of Pain", "Rubick", "Earth Spirit", "Tiny"],
        "hourly_rate": 15.0,
        "experience_years": 3,
        "about": "Мидер и роумер, обучаю микро-контролю и ганкам. Знаю все тайминги и вард-споты.",
    },
}


def seed_test_profiles(db: Session):
    """Create core_users and profiles for test accounts."""
    created = 0

    for auth_id, data in TEST_PROFILES.items():
        # Ensure core_user exists
        core_user = db.query(CoreUser).filter(CoreUser.auth_user_id == auth_id).first()
        if not core_user:
            core_user = CoreUser(auth_user_id=auth_id)
            db.add(core_user)
            db.flush()

        if data["type"] == "player":
            existing = db.query(PlayerProfile).filter(
                PlayerProfile.core_user_id == core_user.id
            ).first()
            if not existing:
                profile = PlayerProfile(
                    core_user_id=core_user.id,
                    steam_id=data.get("steam_id"),
                    dota_account_id=data.get("dota_account_id"),
                    actual_rank_tier=data.get("actual_rank_tier"),
                    actual_roles=data.get("actual_roles"),
                    desired_rank_tier=data.get("desired_rank_tier"),
                    desired_roles=data.get("desired_roles"),
                    training_goals=data.get("training_goals"),
                    about=data.get("about"),
                )
                db.add(profile)
                created += 1

        elif data["type"] == "coach":
            existing = db.query(CoachProfile).filter(
                CoachProfile.core_user_id == core_user.id
            ).first()
            if not existing:
                profile = CoachProfile(
                    core_user_id=core_user.id,
                    mmr_estimate=data.get("mmr_estimate"),
                    rank_tier=data.get("rank_tier"),
                    main_roles=data.get("main_roles"),
                    hero_pool=data.get("hero_pool"),
                    hourly_rate=data.get("hourly_rate"),
                    experience_years=data.get("experience_years"),
                    about=data.get("about"),
                    is_verified=True,
                )
                db.add(profile)
                created += 1

    db.commit()
    logger.info(f"Core seed complete: {created} new profiles created")
    return created

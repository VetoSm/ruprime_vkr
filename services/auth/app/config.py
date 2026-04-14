import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://dota_coach:dota_coach_secret_2026@localhost:5432/dota_coach_db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_EXPIRES_MIN: int = int(os.getenv("JWT_ACCESS_EXPIRES_MIN", "10080"))
    JWT_REFRESH_EXPIRES_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRES_DAYS", "90"))

    STEAM_OPENID_ENABLED: bool = os.getenv("STEAM_OPENID_ENABLED", "true").lower() in ("true", "1", "yes")
    STEAM_RETURN_URL: str = os.getenv("STEAM_RETURN_URL", "http://localhost:8001/auth/steam/callback")
    STEAM_REALM: str = os.getenv("STEAM_REALM", "http://localhost:8001/")
    FRONTEND_STEAM_REDIRECT: str = os.getenv(
        "FRONTEND_STEAM_REDIRECT",
        "http://localhost:3000/auth/steam-callback",
    )


settings = Settings()

import os


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Environment variable {name} is required and must not be empty. "
            "Refusing to start with an insecure default."
        )
    return value


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://dota_coach:dota_coach_secret_2026@localhost:5432/dota_coach_db")
    JWT_SECRET: str = _required("JWT_SECRET")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_EXPIRES_MIN: int = int(os.getenv("JWT_ACCESS_EXPIRES_MIN", "30"))
    JWT_REFRESH_EXPIRES_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRES_DAYS", "30"))

    STEAM_OPENID_ENABLED: bool = os.getenv("STEAM_OPENID_ENABLED", "true").lower() in ("true", "1", "yes")
    STEAM_RETURN_URL: str = os.getenv("STEAM_RETURN_URL", "http://localhost:8001/auth/steam/callback")
    STEAM_REALM: str = os.getenv("STEAM_REALM", "http://localhost:8001/")
    FRONTEND_STEAM_REDIRECT: str = os.getenv(
        "FRONTEND_STEAM_REDIRECT",
        "http://localhost:3000/auth/steam-callback",
    )


settings = Settings()

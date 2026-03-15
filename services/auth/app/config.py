import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://dota_coach:dota_coach_secret_2026@localhost:5432/dota_coach_db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_EXPIRES_MIN: int = int(os.getenv("JWT_ACCESS_EXPIRES_MIN", "30"))
    JWT_REFRESH_EXPIRES_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRES_DAYS", "7"))


settings = Settings()

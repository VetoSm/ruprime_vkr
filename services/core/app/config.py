import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://dota_coach:dota_coach_secret_2026@localhost:5432/dota_coach_db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    AUTH_SERVICE_URL: str = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
    ML_SERVICE_URL: str = os.getenv("ML_SERVICE_URL", "http://localhost:8003")
    LLM_SERVICE_URL: str = os.getenv("LLM_SERVICE_URL", "http://localhost:8004")


settings = Settings()

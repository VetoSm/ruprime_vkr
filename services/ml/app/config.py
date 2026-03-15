import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://dota_coach:dota_coach_secret_2026@localhost:5432/dota_coach_db")
    KAGGLE_DATA_PATH: str = os.getenv("KAGGLE_DATA_PATH", "/data/archive-2")


settings = Settings()

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
    AUTH_SERVICE_URL: str = os.getenv("AUTH_SERVICE_URL", "http://auth:8001")
    ML_SERVICE_URL: str = os.getenv("ML_SERVICE_URL", "http://ml:8003")
    LLM_SERVICE_URL: str = os.getenv("LLM_SERVICE_URL", "http://llm:8004")
    ML_INTERNAL_TOKEN: str = _required("ML_INTERNAL_TOKEN")


settings = Settings()

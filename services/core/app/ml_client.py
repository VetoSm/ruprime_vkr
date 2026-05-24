"""Helpers for calling the internal ML service from core.

Core is the only allowed caller into the ML service in production. Every
outbound request to ML must include the shared ``X-Internal-Token`` header,
otherwise ML returns 401. This module centralises the header so individual
routers do not have to remember it.
"""
from __future__ import annotations

from app.config import settings


def ml_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    """Return the mandatory internal-auth header for ML calls."""
    headers = {"X-Internal-Token": settings.ML_INTERNAL_TOKEN}
    if extra:
        headers.update(extra)
    return headers

"""Internal-token gate for the ML service.

The ML service is not exposed to the public internet. Only other services
(core, LLM) that live inside the Docker network may call it, and each such
call must include a shared secret in the `X-Internal-Token` header. This
prevents trivial data exfiltration and arbitrary Steam lookups from anyone
who could reach port 8003 directly.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def _expected_token() -> str:
    token = os.getenv("ML_INTERNAL_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "ML_INTERNAL_TOKEN is required for the ML service to start. "
            "Set it in the environment for both `ml` and `core`."
        )
    return token


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """FastAPI dependency enforcing a valid internal token."""
    expected = _expected_token()
    if not x_internal_token or x_internal_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal token",
        )

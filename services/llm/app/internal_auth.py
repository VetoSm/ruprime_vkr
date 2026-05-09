"""Internal-token gate for the LLM service.

The frontend must never call LLM directly. Core builds a per-user context
after authentication and sends it to this service with a shared internal token.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def _expected_token() -> str:
    token = os.getenv("ML_INTERNAL_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "ML_INTERNAL_TOKEN is required for the LLM service to start. "
            "Set it for `core`, `ml` and `llm`."
        )
    return token


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = _expected_token()
    if not x_internal_token or x_internal_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal token",
        )

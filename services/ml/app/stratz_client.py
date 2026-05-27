"""STRATZ GraphQL client and persistent quota guard.

The API key is intentionally read only from environment variables. Do not
commit it to the repository or expose it to frontend/Core responses.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal

logger = logging.getLogger(__name__)

STRATZ_GRAPHQL_URL = os.getenv("STRATZ_GRAPHQL_URL", "https://api.stratz.com/graphql").strip()
STRATZ_API_KEY = os.getenv("STRATZ_API_KEY", "").strip()
STRATZ_ENABLED = bool(STRATZ_API_KEY)
STRATZ_TIMEOUT_SEC = float(os.getenv("STRATZ_TIMEOUT_SEC", "20"))

STRATZ_LIMITS = {
    "second": int(os.getenv("STRATZ_RATE_PER_SECOND", "7")),
    "minute": int(os.getenv("STRATZ_RATE_PER_MINUTE", "136")),
    "hour": int(os.getenv("STRATZ_RATE_PER_HOUR", "1462")),
    "day": int(os.getenv("STRATZ_RATE_PER_DAY", "10000")),
}

MATCH_QUERY = """
query RuPrimeMatch($id: Long!) {
  match(id: $id) {
    id
    durationSeconds
    startDateTime
    gameMode
    lobbyType
    didRadiantWin
    radiantScore: radiantKills
    direScore: direKills
    players {
      steamAccountId
      heroId
      playerSlot
      kills
      deaths
      assists
      goldPerMinute
      experiencePerMinute
      numLastHits
      heroDamage
      towerDamage
    }
  }
}
"""

MINIMAL_MATCH_QUERY = """
query RuPrimeMatchMinimal($id: Long!) {
  match(id: $id) {
    id
    durationSeconds
    startDateTime
    gameMode
    lobbyType
    didRadiantWin
    radiantScore: radiantKills
    direScore: direKills
    players {
      steamAccountId
      heroId
      playerSlot
      position
      kills
      deaths
      assists
      goldPerMinute
      experiencePerMinute
      numLastHits
      heroDamage
      towerDamage
    }
  }
}
"""


def _window_start(now: datetime, name: str) -> datetime:
    if name == "second":
        return now.replace(microsecond=0)
    if name == "minute":
        return now.replace(second=0, microsecond=0)
    if name == "hour":
        return now.replace(minute=0, second=0, microsecond=0)
    if name == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    raise ValueError(f"Unknown STRATZ quota window: {name}")


def _window_end(start: datetime, name: str) -> datetime:
    if name == "second":
        return start + timedelta(seconds=1)
    if name == "minute":
        return start + timedelta(minutes=1)
    if name == "hour":
        return start + timedelta(hours=1)
    if name == "day":
        return start + timedelta(days=1)
    raise ValueError(f"Unknown STRATZ quota window: {name}")


def stratz_remaining(db: Optional[Session] = None) -> dict[str, Any]:
    """Return remaining counters for UI/health without consuming quota."""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        now = datetime.now(timezone.utc)
        result: dict[str, Any] = {"enabled": STRATZ_ENABLED}
        for name, limit in STRATZ_LIMITS.items():
            start = _window_start(now, name)
            key = f"{name}:{start.isoformat()}"
            row = db.execute(
                text("SELECT used FROM stratz_api_usage WHERE window_key = :key"),
                {"key": key},
            ).first()
            used = int(row[0]) if row else 0
            result[f"{name}_remaining"] = max(limit - used, 0)
            result[f"{name}_limit"] = limit
        return result
    finally:
        if close_db:
            db.close()


def consume_stratz_quota(cost: int = 1, timeout: float = 0.0) -> bool:
    """Reserve quota across second/minute/hour/day windows.

    Uses one short transaction with row locks. If any window is exhausted,
    the reservation is rolled back and the caller may retry later.
    """
    if not STRATZ_ENABLED:
        return False
    deadline = time.monotonic() + max(0.0, timeout)
    while True:
        db = SessionLocal()
        try:
            now = datetime.now(timezone.utc)
            blocked_until: datetime | None = None
            for name, limit in STRATZ_LIMITS.items():
                start = _window_start(now, name)
                key = f"{name}:{start.isoformat()}"
                db.execute(
                    text(
                        "INSERT INTO stratz_api_usage (window_key, window_name, window_start, used, updated_at) "
                        "VALUES (:key, :name, :start, 0, NOW()) "
                        "ON CONFLICT (window_key) DO NOTHING"
                    ),
                    {"key": key, "name": name, "start": start},
                )
                row = db.execute(
                    text("SELECT used FROM stratz_api_usage WHERE window_key = :key FOR UPDATE"),
                    {"key": key},
                ).first()
                used = int(row[0]) if row else 0
                if used + cost > limit:
                    end = _window_end(start, name)
                    blocked_until = min(blocked_until, end) if blocked_until else end
            if blocked_until is None:
                for name in STRATZ_LIMITS:
                    start = _window_start(now, name)
                    key = f"{name}:{start.isoformat()}"
                    db.execute(
                        text(
                            "UPDATE stratz_api_usage SET used = used + :cost, updated_at = NOW() "
                            "WHERE window_key = :key"
                        ),
                        {"key": key, "cost": cost},
                    )
                db.commit()
                return True
            db.rollback()
            wait = max((blocked_until - now).total_seconds(), 0.1)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            logger.warning("STRATZ quota reservation failed: %s", exc)
            return False
        finally:
            db.close()

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(wait, remaining, 1.0))


class StratzClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key or STRATZ_API_KEY).strip()
        self.enabled = bool(self.api_key)

    def fetch_match(self, match_id: int) -> Optional[dict[str, Any]]:
        if not self.enabled:
            return None
        data = self._graphql(MATCH_QUERY, {"id": int(match_id)})
        if data is None:
            data = self._graphql(MINIMAL_MATCH_QUERY, {"id": int(match_id)})
        if not data:
            return None
        return data.get("match")

    def _graphql(self, query: str, variables: dict[str, Any]) -> Optional[dict[str, Any]]:
        if not consume_stratz_quota(timeout=10.0):
            logger.info("STRATZ quota unavailable; skipping request")
            return None
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "RuPrime/1.0",
        }
        payload = {"query": query, "variables": variables}
        try:
            with httpx.Client(timeout=STRATZ_TIMEOUT_SEC) as client:
                resp = client.post(STRATZ_GRAPHQL_URL, json=payload, headers=headers)
        except Exception as exc:  # noqa: BLE001
            logger.warning("STRATZ network error: %s", exc)
            return None
        if resp.status_code == 429:
            logger.warning("STRATZ rate limited: %s", resp.text[:200])
            return None
        if resp.status_code != 200:
            logger.warning("STRATZ HTTP %s: %s", resp.status_code, resp.text[:300])
            return None
        try:
            data = resp.json()
        except Exception:
            return None
        if data.get("errors"):
            logger.warning("STRATZ GraphQL errors: %s", data.get("errors"))
            return None
        return data.get("data") or None


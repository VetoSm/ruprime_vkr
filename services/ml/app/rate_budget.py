"""Process-wide token bucket for OpenDota's 60 req/min free tier (or
1200 req/min on the paid plan).

Usage::

    from app.rate_budget import opendota_budget
    if opendota_budget.take(timeout=10):
        do_one_opendota_call()
    else:
        # Cannot afford a call right now — skip this iteration.

The bucket is thread-safe. Multiple threads (parse worker, player sync,
on-demand fetches from FastAPI handlers) share the same bucket so we
never accidentally exceed the rate limit collectively.

This wrapper is intentionally *advisory* — existing call sites in
``opendota_client`` still rely on their own ``time.sleep(RATE_LIMIT_DELAY)``
politeness, and the upstream's own 429 backoff is the last line of
defense.  The bucket exists so the new parse worker can prove it
shouldn't fire a batch and so the user-facing fetcher can choose to
fail fast instead of getting throttled mid-page-load.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass


@dataclass
class _BucketState:
    capacity: int
    refill_per_sec: float
    tokens: float
    last_refill_ts: float


class TokenBucket:
    """Simple thread-safe token bucket.

    ``capacity`` is the burst limit, ``refill_per_sec`` is the steady
    rate.  For OpenDota free: ``capacity=60, refill_per_sec=1.0``.  For
    OpenDota Premium (1200/min): ``capacity=1200, refill_per_sec=20.0``.
    """

    def __init__(self, capacity: int, refill_per_sec: float):
        self._state = _BucketState(
            capacity=capacity,
            refill_per_sec=refill_per_sec,
            tokens=float(capacity),
            last_refill_ts=time.monotonic(),
        )
        self._lock = threading.Lock()

    # ---- core ----

    def _refill_locked(self) -> None:
        now = time.monotonic()
        elapsed = now - self._state.last_refill_ts
        if elapsed <= 0:
            return
        self._state.tokens = min(
            float(self._state.capacity),
            self._state.tokens + elapsed * self._state.refill_per_sec,
        )
        self._state.last_refill_ts = now

    def take(self, n: int = 1, timeout: float = 0.0) -> bool:
        """Block up to ``timeout`` seconds trying to take ``n`` tokens.

        ``timeout=0`` means non-blocking.  Returns ``True`` on success.
        """
        deadline = time.monotonic() + max(0.0, timeout)
        while True:
            with self._lock:
                self._refill_locked()
                if self._state.tokens >= n:
                    self._state.tokens -= n
                    return True
                need = n - self._state.tokens
                wait_secs = need / self._state.refill_per_sec
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            time.sleep(min(wait_secs, remaining, 0.5))

    # ---- introspection (for /parse-progress endpoint, tests) ----

    def available(self) -> float:
        with self._lock:
            self._refill_locked()
            return float(self._state.tokens)

    def capacity(self) -> int:
        return self._state.capacity


def _build_default() -> TokenBucket:
    """Pick limits from env: assume free tier unless OPENDOTA_API_KEY is set.

    With an API key OpenDota raises the limit to 1200/min.  Operators
    can override via ``OPENDOTA_RATE_PER_MIN`` if their account has a
    custom quota.
    """
    has_key = bool(os.getenv("OPENDOTA_API_KEY", "").strip())
    default_per_min = 1200 if has_key else 60
    per_min = int(os.getenv("OPENDOTA_RATE_PER_MIN", str(default_per_min)))
    capacity = max(1, per_min)
    refill = max(0.01, per_min / 60.0)
    return TokenBucket(capacity=capacity, refill_per_sec=refill)


# Shared instance used by parse_worker and on-demand fetches.
opendota_budget: TokenBucket = _build_default()

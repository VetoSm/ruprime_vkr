import threading
import time
from collections import defaultdict, deque


_lock = threading.Lock()
_buckets = defaultdict(deque)


def check_rate_limit(scope: str, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
    now = time.time()
    bucket_key = f"{scope}:{key}"
    with _lock:
        q = _buckets[bucket_key]
        while q and (now - q[0]) > window_seconds:
            q.popleft()

        if len(q) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - q[0])))
            return False, retry_after

        q.append(now)
        return True, 0

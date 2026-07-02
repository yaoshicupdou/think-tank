import time
import threading
from collections import defaultdict
from app.core.config import settings


class RateLimiter:
    """In-memory rate limiter keyed by identifier string."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._store: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()
        self._call_count = 0

    def _prune(self, key: str):
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            self._store[key] = [t for t in self._store[key] if t > cutoff]
            if not self._store[key]:
                del self._store[key]

    def is_blocked(self, key: str) -> bool:
        self._prune(key)
        with self._lock:
            return len(self._store.get(key, [])) >= self.max_attempts

    def record_failure(self, key: str):
        with self._lock:
            self._store[key].append(time.time())
        self._maybe_cleanup()

    def reset(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def remaining_block_seconds(self, key: str) -> int:
        self._prune(key)
        with self._lock:
            timestamps = self._store.get(key, [])
            if not timestamps or len(timestamps) < self.max_attempts:
                return 0
            oldest = min(timestamps)
            return max(1, int(self.window_seconds - (time.time() - oldest)))

    def _maybe_cleanup(self):
        """全局清理过期 key，每 100 次调用执行一次。"""
        self._call_count += 1
        if self._call_count % 100 != 0:
            return
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            stale = [
                k for k, v in self._store.items()
                if all(t <= cutoff for t in v)
            ]
            for k in stale:
                del self._store[k]


login_rate_limiter = RateLimiter(
    max_attempts=settings.LOGIN_RATE_LIMIT_MAX,
    window_seconds=settings.LOGIN_RATE_LIMIT_WINDOW,
)

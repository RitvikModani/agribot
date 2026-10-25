from __future__ import annotations

from datetime import date, datetime


class RateLimiter:
    """Per-device token bucket plus a daily cap. In-memory: the Space runs one process."""

    def __init__(self, per_second: float = 0.5, burst: int = 3, daily: int = 2000) -> None:
        self._rate = per_second
        self._burst = burst
        self._daily = daily
        self._buckets: dict[str, tuple[float, datetime]] = {}
        self._days: dict[str, tuple[date, int]] = {}

    def allow(self, key: str, now: datetime) -> bool:
        tokens, last = self._buckets.get(key, (float(self._burst), now))
        tokens = min(self._burst, tokens + (now - last).total_seconds() * self._rate)
        day, used = self._days.get(key, (now.date(), 0))
        if day != now.date():
            day, used = now.date(), 0
        if tokens < 1 or used >= self._daily:
            self._buckets[key] = (tokens, now)
            return False
        self._buckets[key] = (tokens - 1, now)
        self._days[key] = (day, used + 1)
        return True

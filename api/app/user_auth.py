"""Who is calling a dashboard endpoint: verifies a Supabase access token."""
from __future__ import annotations

import hashlib
import time
from typing import Callable, Protocol

import httpx


class UserAuth(Protocol):
    def user_id(self, token: str) -> str | None: ...


class SupabaseUserAuth:
    """Asks Supabase whose token this is; caches answers for `ttl` seconds. Fails closed."""

    def __init__(self, url: str, api_key: str, ttl: float = 300, clock: Callable[[], float] = time.monotonic) -> None:
        self._http = httpx.Client(base_url=url.rstrip("/"), headers={"apikey": api_key}, timeout=10)
        self._ttl = ttl
        self._clock = clock
        self._cache: dict[str, tuple[str | None, float]] = {}

    def user_id(self, token: str) -> str | None:
        key = hashlib.sha256(token.encode()).hexdigest()
        hit = self._cache.get(key)
        if hit and hit[1] > self._clock():
            return hit[0]
        try:
            r = self._http.get("/auth/v1/user", headers={"Authorization": f"Bearer {token}"})
            uid = r.json().get("id") if r.status_code == 200 else None
        except (httpx.HTTPError, ValueError):
            return None  # don't cache transient failures
        self._cache[key] = (uid, self._clock() + self._ttl)
        return uid

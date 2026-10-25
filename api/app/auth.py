from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta
from typing import Callable

from .store import Device, Store

TOKEN_PATTERN = re.compile(r"^agb_[A-Za-z0-9_-]{20,80}$")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class DeviceAuth:
    """Resolves device tokens, caching hits so a 2 s poll isn't a DB query each time.

    Misses are not cached, so a freshly issued token works immediately. A revoke
    or rotate takes effect within `ttl_seconds`.
    """

    def __init__(self, store: Store, clock: Callable[[], datetime], ttl_seconds: int = 60) -> None:
        self._store = store
        self._clock = clock
        self._ttl = timedelta(seconds=ttl_seconds)
        self._cache: dict[str, tuple[Device, datetime]] = {}

    def resolve(self, token: str | None) -> Device | None:
        if not token or not TOKEN_PATTERN.match(token):
            return None
        key = hash_token(token)
        now = self._clock()
        hit = self._cache.get(key)
        if hit and hit[1] > now:
            return hit[0]
        device = self._store.get_device_by_token_hash(key)
        if device is not None:
            self._cache[key] = (device, now + self._ttl)
        return device

"""Storage boundary. The API talks only to `Store`; Supabase and memory implement it."""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol


class StoreError(Exception):
    """The backing store failed; the device should retry."""


@dataclass(frozen=True)
class Device:
    id: str
    owner: str
    name: str
    revoked: bool


@dataclass
class DeviceState:
    capture_requested_at: datetime | None = None
    patrol_on: bool = False
    patrol_interval_s: int = 10
    plant_tag: str | None = None


@dataclass(frozen=True)
class CaptureRow:
    id: str
    device_id: str
    owner: str
    image_path: str
    label: str
    confidence: float
    verdict: str
    leaf_fraction: float
    top3: list[dict]
    model_version: str
    plant_tag: str | None


class Store(Protocol):
    def get_device_by_token_hash(self, token_hash: str) -> Device | None: ...
    def get_capture(self, capture_id: str) -> CaptureRow | None: ...
    def put_image(self, path: str, data: bytes) -> None: ...
    def insert_capture(self, row: CaptureRow) -> None: ...
    def get_state(self, device_id: str) -> DeviceState: ...
    def clear_capture_request(self, device_id: str) -> None: ...
    def touch_last_seen(self, device_id: str, at: datetime) -> None: ...


@dataclass
class MemoryStore:
    """For tests and local runs. Not durable."""

    devices: dict[str, Device] = field(default_factory=dict)  # token_hash -> Device
    states: dict[str, DeviceState] = field(default_factory=dict)  # device_id -> state
    captures: dict[str, CaptureRow] = field(default_factory=dict)
    images: dict[str, bytes] = field(default_factory=dict)
    insert_count: int = 0
    touches: int = 0
    fail: bool = False

    def add_device(self, token: str, owner: str, name: str) -> Device:
        device = Device(id=str(uuid.uuid4()), owner=owner, name=name, revoked=False)
        self.devices[hashlib.sha256(token.encode()).hexdigest()] = device
        self.states[device.id] = DeviceState()
        return device

    def _key(self, token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def device_id(self, token: str) -> str:
        return self.devices[self._key(token)].id

    def state(self, token: str) -> DeviceState:
        return self.states[self.device_id(token)]

    def revoke(self, token: str) -> None:
        d = self.devices[self._key(token)]
        self.devices[self._key(token)] = Device(d.id, d.owner, d.name, revoked=True)

    def _check(self) -> None:
        if self.fail:
            raise StoreError("memory store set to fail")

    def get_device_by_token_hash(self, token_hash: str) -> Device | None:
        return self.devices.get(token_hash)

    def get_capture(self, capture_id: str) -> CaptureRow | None:
        return self.captures.get(capture_id)

    def put_image(self, path: str, data: bytes) -> None:
        self._check()
        self.images[path] = data

    def insert_capture(self, row: CaptureRow) -> None:
        self._check()
        self.captures.setdefault(row.id, row)
        self.insert_count += 1

    def get_state(self, device_id: str) -> DeviceState:
        self._check()
        return self.states[device_id]

    def clear_capture_request(self, device_id: str) -> None:
        self._check()
        self.states[device_id].capture_requested_at = None

    def touch_last_seen(self, device_id: str, at: datetime) -> None:
        self.touches += 1

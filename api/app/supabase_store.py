"""`Store` over Supabase REST (PostgREST) and Storage, using the service-role key."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

import httpx

from .store import CaptureRow, Device, DeviceState, StoreError

BUCKET = "captures"


def _parse_ts(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


class SupabaseStore:
    def __init__(self, url: str, service_role_key: str, timeout: float = 10.0) -> None:
        if not url or not service_role_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self._http = httpx.Client(
            base_url=url.rstrip("/"),
            headers={"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"},
            timeout=timeout,
        )

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            response = self._http.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise StoreError(f"{method} {path}: {exc}") from exc
        if response.status_code >= 400:
            raise StoreError(f"{method} {path}: HTTP {response.status_code} {response.text[:200]}")
        return response

    def get_device_by_token_hash(self, token_hash: str) -> Device | None:
        rows = self._request("GET", "/rest/v1/devices", params={
            "select": "id,owner,name,revoked_at", "token_hash": f"eq.{token_hash}", "limit": "1"}).json()
        if not rows:
            return None
        r = rows[0]
        return Device(id=r["id"], owner=r["owner"], name=r["name"], revoked=r["revoked_at"] is not None)

    def get_capture(self, capture_id: str) -> CaptureRow | None:
        rows = self._request("GET", "/rest/v1/captures", params={
            "select": ",".join(CaptureRow.__dataclass_fields__), "id": f"eq.{capture_id}", "limit": "1"}).json()
        return CaptureRow(**rows[0]) if rows else None

    def put_image(self, path: str, data: bytes) -> None:
        self._request("POST", f"/storage/v1/object/{BUCKET}/{path}", content=data,
                      headers={"Content-Type": "image/jpeg", "x-upsert": "true"})

    def insert_capture(self, row: CaptureRow) -> None:
        self._request("POST", "/rest/v1/captures", json=asdict(row),
                      headers={"Prefer": "return=minimal,resolution=ignore-duplicates"})

    def get_state(self, device_id: str) -> DeviceState:
        rows = self._request("GET", "/rest/v1/device_state", params={
            "select": "capture_requested_at,patrol_on,patrol_interval_s,plant_tag",
            "device_id": f"eq.{device_id}", "limit": "1"}).json()
        if not rows:
            return DeviceState()
        r = rows[0]
        return DeviceState(capture_requested_at=_parse_ts(r["capture_requested_at"]), patrol_on=r["patrol_on"],
                           patrol_interval_s=r["patrol_interval_s"], plant_tag=r["plant_tag"])

    def clear_capture_request(self, device_id: str) -> None:
        self._request("PATCH", "/rest/v1/device_state", params={"device_id": f"eq.{device_id}"},
                      json={"capture_requested_at": None}, headers={"Prefer": "return=minimal"})

    def touch_last_seen(self, device_id: str, at: datetime) -> None:
        self._request("PATCH", "/rest/v1/devices", params={"id": f"eq.{device_id}"},
                      json={"last_seen_at": at.isoformat()}, headers={"Prefer": "return=minimal"})

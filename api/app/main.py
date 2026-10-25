"""AgriBot inference API.

Run on the Space:   uvicorn app.main:build_app --factory --host 0.0.0.0 --port 7860
Run locally (no Supabase):  set AGRIBOT_STORE=memory and AGRIBOT_DEV_TOKEN=agb_<43 chars>
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool

from .auth import DeviceAuth
from .config import Settings
from .inference import Classifier, OnnxClassifier
from .preprocess import InvalidImage, decode, leaf_fraction, to_tensor
from .ratelimit import RateLimiter
from .store import CaptureRow, Device, MemoryStore, Store, StoreError

log = logging.getLogger("agribot")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(ts: datetime | None) -> str | None:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if ts else None


def capture_view(row: CaptureRow) -> dict:
    return {"id": row.id, "label": row.label, "confidence": row.confidence, "verdict": row.verdict,
            "leaf_fraction": row.leaf_fraction, "top3": row.top3}


def create_app(store: Store, classifier: Classifier, settings: Settings,
               clock: Callable[[], datetime] = utcnow) -> FastAPI:
    app = FastAPI(title="AgriBot API", docs_url=None, redoc_url=None, openapi_url=None)
    auth = DeviceAuth(store, clock)
    limiter = RateLimiter()
    last_touch: dict[str, datetime] = {}

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        device = getattr(request.state, "device_id", "-")
        log.info("%s %s %s device=%s %.0fms", request.method, request.url.path, response.status_code,
                 device, (time.perf_counter() - started) * 1000)
        return response

    def require_device(request: Request, x_device_token: str | None = Header(default=None)) -> Device:
        device = auth.resolve(x_device_token)
        if device is None:
            raise HTTPException(401, "unknown device token")
        request.state.device_id = device.id
        if device.revoked:
            raise HTTPException(403, "device revoked")
        return device

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True, "model_version": settings.model_version}

    @app.get("/v1/device/state")
    def device_state(device: Device = Depends(require_device)) -> dict:
        now = clock()
        try:
            state = store.get_state(device.id)
        except StoreError as exc:
            log.warning("state read failed: %s", exc)
            raise HTTPException(503, "store unavailable") from exc
        previous = last_touch.get(device.id)
        if previous is None or (now - previous).total_seconds() >= 5:
            try:
                store.touch_last_seen(device.id, now)
                last_touch[device.id] = now
            except StoreError as exc:  # presence is best-effort; never fail the poll for it
                log.warning("last_seen write failed: %s", exc)
        return {"capture_requested_at": iso(state.capture_requested_at), "patrol_on": state.patrol_on,
                "patrol_interval_s": state.patrol_interval_s, "server_time": iso(now)}

    def analyse(device: Device, capture_id: str, trigger: str, body: bytes) -> CaptureRow:
        img = decode(body, settings.min_side)
        ranked = classifier.predict(to_tensor(img))
        label, confidence = ranked[0]
        leaf = leaf_fraction(img)
        if leaf < settings.min_leaf_fraction:
            verdict = "no_leaf"
        elif confidence < settings.low_confidence:
            verdict = "uncertain"
        else:
            verdict = "confident"
        state = store.get_state(device.id)
        path = f"{device.owner}/{device.id}/{capture_id}.jpg"
        row = CaptureRow(id=capture_id, device_id=device.id, owner=device.owner, image_path=path,
                         label=label, confidence=round(confidence, 4), verdict=verdict,
                         leaf_fraction=round(leaf, 4),
                         top3=[{"label": k, "confidence": round(p, 4)} for k, p in ranked[:3]],
                         model_version=settings.model_version, plant_tag=state.plant_tag)
        store.put_image(path, body)
        store.insert_capture(row)
        if trigger == "manual":
            store.clear_capture_request(device.id)
        return row

    @app.post("/v1/captures", status_code=201)
    async def create_capture(request: Request, response: Response, device: Device = Depends(require_device),
                             x_capture_id: str | None = Header(default=None),
                             x_trigger: str = Header(default="manual")) -> dict:
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "image/jpeg":
            raise HTTPException(415, "send image/jpeg")
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes:
            raise HTTPException(413, "image larger than 2 MB")
        body = await request.body()
        if len(body) > settings.max_upload_bytes:
            raise HTTPException(413, "image larger than 2 MB")
        try:
            capture_id = str(uuid.UUID(x_capture_id or ""))
        except ValueError as exc:
            raise HTTPException(422, "X-Capture-Id must be a UUID") from exc
        trigger = x_trigger.lower()
        if trigger not in ("manual", "patrol"):
            raise HTTPException(422, "X-Trigger must be manual or patrol")
        if not limiter.allow(device.id, clock()):
            raise HTTPException(429, "slow down")
        try:
            existing = await run_in_threadpool(store.get_capture, capture_id)
            if existing is not None:
                if existing.device_id != device.id:
                    raise HTTPException(409, "capture id belongs to another device")
                response.status_code = 200
                return capture_view(existing)
            row = await run_in_threadpool(analyse, device, capture_id, trigger, body)
        except InvalidImage as exc:
            raise HTTPException(422, str(exc)) from exc
        except StoreError as exc:
            log.warning("capture %s failed: %s", capture_id, exc)
            raise HTTPException(503, "store unavailable, retry with the same X-Capture-Id") from exc
        return capture_view(row)

    return app


def build_app() -> FastAPI:
    """Uvicorn factory: real model, Supabase store (or memory when AGRIBOT_STORE=memory)."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = Settings.from_env()
    if os.environ.get("AGRIBOT_STORE") == "memory":
        store: Store = MemoryStore()
        dev_token = os.environ.get("AGRIBOT_DEV_TOKEN")
        if dev_token:
            store.add_device(dev_token, owner="00000000-0000-0000-0000-000000000000", name="dev")
    else:
        from .supabase_store import SupabaseStore
        store = SupabaseStore(settings.supabase_url, settings.supabase_service_role_key)
    return create_app(store, OnnxClassifier(settings.model_path), settings)

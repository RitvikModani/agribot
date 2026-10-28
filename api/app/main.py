"""AgriBot inference API.

Run on the Space:   uvicorn app.main:build_app --factory --host 0.0.0.0 --port 7860
Run locally (no Supabase):  set AGRIBOT_STORE=memory and AGRIBOT_DEV_TOKEN=agb_<43 chars>
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import DeviceAuth
from .config import Settings
from .inference import Classifier, OnnxClassifier
from .preprocess import InvalidImage, decode, leaf_fraction, to_tensor
from .ratelimit import RateLimiter
from .climate import ClimateError, ClimateSource, OpenMeteoClimate
from .diagnosis import DiagnosisError, DiagnosisWriter, GeminiDiagnosis
from .guides import GeminiGuides, GuideError, GuideWriter, check_place, normalize_plant
from .shops import INGREDIENTS, GeminiShops, ShopFinder, ShopsError
from .store import CaptureRow, Device, MemoryStore, Store, StoreError
from .user_auth import SupabaseUserAuth, UserAuth

SHOP_CACHE_TTL = timedelta(hours=24)


class ShopRequest(BaseModel):
    label: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class GuideRequest(BaseModel):
    plant: str
    place: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


GUIDE_CACHE_TTL = timedelta(days=30)

log = logging.getLogger("agribot")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(ts: datetime | None) -> str | None:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if ts else None


def capture_view(row: CaptureRow) -> dict:
    return {"id": row.id, "label": row.label, "confidence": row.confidence, "verdict": row.verdict,
            "leaf_fraction": row.leaf_fraction, "top3": row.top3, "ai_status": row.ai_status}


def create_app(store: Store, classifier: Classifier, settings: Settings,
               clock: Callable[[], datetime] = utcnow, shops: ShopFinder | None = None,
               user_auth: UserAuth | None = None, guides: GuideWriter | None = None,
               climate: ClimateSource | None = None, diagnosis: DiagnosisWriter | None = None) -> FastAPI:
    app = FastAPI(title="AgriBot API", docs_url=None, redoc_url=None, openapi_url=None)
    # Browsers calling from the dashboard (Wake API, shops) need CORS; the camera doesn't care.
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                       allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
    auth = DeviceAuth(store, clock)
    limiter = RateLimiter()
    shop_limiter = RateLimiter(per_second=10 / 60, burst=10, daily=500)
    shop_cache: dict[tuple[str, float, float], tuple[datetime, str, list[dict]]] = {}
    guide_limiter = RateLimiter(per_second=10 / 60, burst=10, daily=300)
    guide_cache: dict[tuple[str, float, float], tuple[datetime, dict]] = {}
    ai_limiter = RateLimiter(per_second=6 / 60, burst=6, daily=settings.ai_daily_limit)
    # Each store call is a ~300 ms round trip (Render Oregon -> Supabase Mumbai): run independent ones together.
    io_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="store")

    def signed_in_user(authorization: str | None) -> str:
        token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else ""
        user = user_auth.user_id(token) if (user_auth and token) else None
        if user is None:
            raise HTTPException(401, "sign in first")
        return user
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

    def touch(device_id: str, now: datetime) -> None:
        try:
            store.touch_last_seen(device_id, now)
        except StoreError as exc:  # presence is best-effort; never fail the poll for it
            log.warning("last_seen write failed: %s", exc)

    @app.get("/v1/device/state")
    def device_state(background: BackgroundTasks, device: Device = Depends(require_device)) -> dict:
        now = clock()
        try:
            state = store.get_state(device.id)
        except StoreError as exc:
            log.warning("state read failed: %s", exc)
            raise HTTPException(503, "store unavailable") from exc
        previous = last_touch.get(device.id)
        if previous is None or (now - previous).total_seconds() >= 5:
            last_touch[device.id] = now
            background.add_task(touch, device.id, now)  # after the reply: the poll doesn't wait for it
        return {"capture_requested_at": iso(state.capture_requested_at), "patrol_on": state.patrol_on,
                "patrol_interval_s": state.patrol_interval_s, "server_time": iso(now)}

    def analyse(device: Device, capture_id: str, trigger: str, body: bytes) -> CaptureRow:
        started = time.perf_counter()
        img = decode(body, settings.min_side)  # reject a bad image before anything is stored
        path = f"{device.owner}/{device.id}/{capture_id}.jpg"
        # The upload (upsert) and the state read don't depend on the model, so they run while it does.
        upload = io_pool.submit(store.put_image, path, body)
        state_read = io_pool.submit(store.get_state, device.id)
        ranked = classifier.predict(to_tensor(img))
        label, confidence = ranked[0]
        leaf = leaf_fraction(img)
        model_ms = (time.perf_counter() - started) * 1000
        if leaf < settings.min_leaf_fraction:
            verdict = "no_leaf"
        elif confidence < settings.low_confidence:
            verdict = "uncertain"
        else:
            verdict = "confident"
        state = state_read.result()
        upload.result()  # the row must not point at an image that isn't there yet
        ai_status = "pending" if diagnosis is not None and ai_limiter.allow(device.id, clock()) else "skipped"
        row = CaptureRow(id=capture_id, device_id=device.id, owner=device.owner, image_path=path,
                         label=label, confidence=round(confidence, 4), verdict=verdict,
                         leaf_fraction=round(leaf, 4),
                         top3=[{"label": k, "confidence": round(p, 4)} for k, p in ranked[:3]],
                         model_version=settings.model_version, plant_tag=state.plant_tag, ai_status=ai_status)
        writes = [io_pool.submit(store.insert_capture, row)]
        if trigger == "manual":
            writes.append(io_pool.submit(store.clear_capture_request, device.id))
        for write in writes:
            write.result()
        log.info("capture %s model %.0fms total %.0fms", capture_id, model_ms, (time.perf_counter() - started) * 1000)
        return row

    def run_diagnosis(row: CaptureRow, body: bytes) -> None:
        """After the reply: ask Gemini about the whole plant and update the row (the dashboard hears the UPDATE)."""
        try:
            place = store.get_place(row.owner) or "India"
        except StoreError:
            place = "India"
        started = time.perf_counter()
        try:
            ai, status = diagnosis.diagnose(body, place, clock().month), "done"
        except DiagnosisError as exc:
            ai, status = {"reason": str(exc)}, "failed"
        try:
            store.set_diagnosis(row.id, status, ai, settings.gemini_model)
        except StoreError as exc:
            log.warning("diagnosis %s not saved: %s", row.id, exc)
            return
        log.info("diagnosis %s %s in %.0fms", row.id, status, (time.perf_counter() - started) * 1000)

    @app.post("/v1/captures", status_code=201)
    async def create_capture(request: Request, response: Response, background: BackgroundTasks,
                             device: Device = Depends(require_device),
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
        if row.ai_status == "pending":
            background.add_task(run_diagnosis, row, body)
        return capture_view(row)

    @app.post("/v1/shops")
    def find_shops(req: ShopRequest, authorization: str | None = Header(default=None)) -> dict:
        token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else ""
        user = user_auth.user_id(token) if (user_auth and token) else None
        if user is None:
            raise HTTPException(401, "sign in to search for shops")
        if req.label not in INGREDIENTS:
            raise HTTPException(422, "label must be a disease with a treatment")
        if shops is None:
            raise HTTPException(503, "in-app shop search isn't switched on (needs a billed Gemini key)")
        now = clock()
        key = (req.label, round(req.lat, 2), round(req.lon, 2))

        def view(summary: str, found: list[dict], cached: bool) -> dict:
            return {"shops": found, "summary": summary, "ingredients": INGREDIENTS[req.label],
                    "area": f"{key[1]},{key[2]}", "cached": cached}

        hit = shop_cache.get(key)
        if hit and now - hit[0] < SHOP_CACHE_TTL:
            return view(hit[1], hit[2], True)
        if not shop_limiter.allow(user, now):
            raise HTTPException(429, "too many shop searches, try again in a minute")
        try:
            summary, found = shops.find(req.label, req.lat, req.lon)
        except ShopsError as exc:
            log.warning("shop search failed: %s", exc)
            raise HTTPException(502, "shop search failed, use the Google Maps link instead") from exc
        shop_cache[key] = (now, summary, found)
        return view(summary, found, False)

    @app.post("/v1/guide")
    def grow_guide(req: GuideRequest, authorization: str | None = Header(default=None)) -> dict:
        user = signed_in_user(authorization)
        try:
            plant = normalize_plant(req.plant)
            place = check_place(req.place)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        if guides is None or climate is None:
            raise HTTPException(503, "grow guides aren't set up (GEMINI_API_KEY missing)")
        now = clock()
        key = (plant, round(req.lat, 1), round(req.lon, 1))
        try:
            normals = climate.normals(req.lat, req.lon)
            hit = guide_cache.get(key)
            if hit and now - hit[0] < GUIDE_CACHE_TTL:
                return {"guide": hit[1], "climate": normals, "cached": True}
            if not guide_limiter.allow(user, now):
                raise HTTPException(429, "too many guide requests, try again in a minute")
            guide = guides.find(plant, place, normals)
        except (GuideError, ClimateError) as exc:
            log.warning("guide failed: %s", exc)
            # Both errors carry user-safe messages (status and reason, never keys), so say why.
            raise HTTPException(502, f"couldn't write a guide: {exc}") from exc
        guide_cache[key] = (now, guide)
        return {"guide": guide, "climate": normals, "cached": False}

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
    shops = GeminiShops(settings.gemini_api_key, settings.gemini_model) if settings.gemini_api_key and settings.maps_grounding else None
    user_auth = (SupabaseUserAuth(settings.supabase_url, settings.supabase_service_role_key)
                 if settings.supabase_url and settings.supabase_service_role_key else None)
    guides = GeminiGuides(settings.gemini_api_key, settings.gemini_model) if settings.gemini_api_key else None
    diagnosis = GeminiDiagnosis(settings.gemini_api_key, settings.gemini_model) if settings.gemini_api_key else None
    return create_app(store, OnnxClassifier(settings.model_path), settings, shops=shops, user_auth=user_auth,
                      guides=guides, climate=OpenMeteoClimate(), diagnosis=diagnosis)

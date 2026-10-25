# AgriBot v2 Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cloud core loop from the spec: ESP32-CAM → FastAPI/ONNX inference → Supabase → logged-in PWA dashboard, plus the drive failsafe.

**Architecture:** Five independently testable units in one monorepo — `model/` (one-time conversion + eval), `supabase/` (schema, RLS, RPCs), `api/` (FastAPI on a Hugging Face Space, storage behind a `Store` protocol), `firmware/` (camera + drive sketches), `web/` (React PWA with a `DataSource` interface: Supabase in production, Replay for local dev and the offline demo fallback).

**Tech Stack:** Python 3.11, FastAPI, onnxruntime, Pillow, numpy, httpx, pytest · TensorFlow 2.15 + tf2onnx (conversion only) · Supabase (Postgres, Auth, Storage, Realtime) · Arduino (arduino-esp32 core, AVR core), WiFiManager · React 19, Vite, TypeScript, Tailwind v4, vite-plugin-pwa, @supabase/supabase-js, Vitest.

Spec: `docs/superpowers/specs/2026-10-25-agribot-core-loop-design.md`. Code is written directly into the repo test-first; this plan pins files, interfaces, tests and commands rather than duplicating source.

## Global Constraints

- Model input: RGB, EXIF-transposed, `ImageOps.fit(…, (224, 224), LANCZOS)`, float32, `x / 127.5 − 1`, NHWC `[1,224,224,3]`.
- Labels (index 0–9): `bacterial_spot, early_blight, healthy, late_blight, leaf_mold, mosaic_virus, septoria_leaf_spot, spider_mites, target_spot, yellow_leaf_curl_virus`.
- `confidence` is always a float in [0, 1]; low-confidence threshold `0.6`.
- Upload limits: `image/jpeg`, ≤ 2 MB, min side ≥ 96 px; capture ID is a UUID.
- Rate limit: 1 capture / 2 s per device, burst 3, 2000 / UTC day.
- Timings: state poll 2 s · online if last seen < 10 s · "requested, not received" after 15 s · ignore requests > 30 s old · `last_seen_at` write ≤ once / 5 s · token cache 60 s · signed URLs 10 min · patrol interval 3–300 s (default 10).
- Device token format: `agb_` + base64url(32 random bytes); DB stores only SHA-256 hex.
- No secret in the repo, firmware source, or web bundle. Service-role key only in HF Space secrets. Wi-Fi and device token only via the ESP32 setup portal.
- Python venvs live outside OneDrive in `C:\Users\Ritvik\.venvs\` (`agribot-convert`, `agribot-api`).
- Remedy footer text: "Confirm with a local agricultural extension officer before applying any chemical treatment."

## File Structure

```
agribot/
  .gitignore
  .github/workflows/secret-scan.yml      gitleaks on every push/PR
  .github/workflows/pages.yml            build web/ → GitHub Pages
  README.md                              what it is, architecture, links to docs
  docs/SETUP.md                          Ritvik's step-by-step (accounts, keys, flashing)
  docs/demo-runbook.md                   day-before / on-site / fallback
  docs/firmware.md                       build/flash, CA cert record, bench checklist
  docs/wiring.md                         HC-05 STATE → D7, limits
  model/
    labels.json                          index → key, display name
    convert.py                           .h5 → agribot_tomato_v1.onnx (TF 2.15 venv)
    preprocess.py                        tm + legacy preprocessing (shared by eval/tests)
    eval.py                              accuracy per class, tm vs legacy; field distribution
    fetch_plantvillage.py                pulls N labelled tomato images per class
    agribot_tomato_v1.onnx               committed artifact
    fixtures/<label>/*.jpg               1 image per class (parity test)
    tests/test_parity.py                 Keras vs ONNX ≤ 1e-4
    EVAL.md                              recorded results (the deck's numbers)
  supabase/
    migrations/0001_core.sql             tables, RLS, storage bucket + policies, RPCs, realtime
    tests/rls_check.py                   anon/userB/insert checks against real project
  api/
    app/config.py                        Settings from env
    app/labels.py                        LABELS tuple (from model/labels.json)
    app/preprocess.py                    to_tensor(jpeg_bytes) -> np.ndarray
    app/inference.py                     Classifier.predict(tensor) -> list[(label, p)]
    app/auth.py                          hash_token, DeviceAuth (cache)
    app/ratelimit.py                     RateLimiter.check(device_id, now) -> bool
    app/store.py                         Store protocol + Device/CaptureRow/DeviceState dataclasses
    app/supabase_store.py                Store over Supabase REST + Storage (httpx)
    app/main.py                          create_app(store, classifier, settings, clock)
    tests/…                              fakes + endpoint tests
    requirements.txt, requirements-dev.txt, Dockerfile, README.md (HF Space card)
  firmware/
    camera/agribot_camera/agribot_camera.ino, ca_cert.h
    drive/agribot_drive/agribot_drive.ino
  web/                                   Vite React PWA (src/data/DataSource.ts, supabaseSource.ts, replaySource.ts, …)
```

---

### Task 1: Repo hygiene
**Files:** `.gitignore`, `.github/workflows/secret-scan.yml`, `README.md`
- [ ] `.gitignore` covers `.venv*/`, `__pycache__/`, `node_modules/`, `dist/`, `.env*` (except `.env.example`), `*.log`.
- [ ] gitleaks workflow: `gitleaks/gitleaks-action@v2` on push + pull_request, full history (`fetch-depth: 0`).
- [ ] Commit `chore: repo hygiene and secret scanning`.

### Task 2: Model conversion + eval gate
**Files:** `model/labels.json`, `model/preprocess.py`, `model/convert.py`, `model/fetch_plantvillage.py`, `model/eval.py`, `model/tests/test_parity.py`, `model/EVAL.md`, `model/agribot_tomato_v1.onnx`, `model/fixtures/`
**Produces:** `agribot_tomato_v1.onnx` (input `[N,224,224,3]` float32, output `[N,10]` softmax); `preprocess.tm(img) / preprocess.legacy(img) -> np.ndarray[1,224,224,3]`.
- [ ] `fetch_plantvillage.py --per-class 20 --out <dir>` pulls from `spMohanty/PlantVillage-Dataset` `raw/color/Tomato___*` via the GitHub contents API (deterministic: sorted names, take every k-th).
- [ ] `convert.py`: load `.h5` with TF 2.15 (`compile=False`), `tf2onnx.convert.from_keras(opset=13)`, write ONNX.
- [ ] Parity test: for each fixture, `max|keras − onnx| ≤ 1e-4`. Run: `C:\Users\Ritvik\.venvs\agribot-convert\Scripts\python -m pytest model/tests -v` → PASS.
- [ ] `eval.py --data <pv dir> --preprocess both` → record per-class + overall for tm and legacy in `EVAL.md`. **Gate: tm > legacy**, else stop.
- [ ] `eval.py --field <archive>/field-captures` → label distribution under tm vs legacy (unlabelled), recorded in `EVAL.md`.
- [ ] Commit `feat(model): ONNX conversion, parity test, eval gate`.

### Task 3: Supabase schema
**Files:** `supabase/migrations/0001_core.sql`, `supabase/tests/rls_check.py`
**Produces:** tables `devices`, `device_state`, `captures`; RPCs `create_device(name text) returns text`, `rotate_device_token(p_device_id uuid) returns text`; bucket `captures`.
- [ ] SQL exactly per spec §6.5, plus `revoke insert, update on captures from anon, authenticated`, realtime publication for `captures`, `devices`, `device_state`.
- [ ] `rls_check.py` (env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, two test-user credentials): asserts anon select returns 0 rows on all tables; user B sees none of user A's rows; authenticated insert into `captures` fails; `create_device` returns an `agb_` token.
- [ ] Commit `feat(db): schema, RLS, device token RPCs`.

### Task 4: Inference API
**Interfaces:**
- `Store` protocol: `get_device_by_token_hash(h) -> Device|None`, `get_capture(id) -> CaptureRow|None`, `put_image(path, data) -> None`, `insert_capture(row) -> None`, `get_state(device_id) -> DeviceState`, `clear_capture_request(device_id) -> None`, `touch_last_seen(device_id, ts) -> None`.
- `Classifier.predict(x: np.ndarray) -> list[tuple[str, float]]` sorted desc, length 10.
- `create_app(store: Store, classifier: Classifier, settings: Settings, clock: Callable[[], datetime]) -> FastAPI`.
**Tests (pytest, `api/tests/`):** preprocess golden values (tm scaling of a solid-colour image → exact values); auth 401 unknown / 403 revoked / 200 valid; 415 wrong type; 413 > 2 MB; 422 not-a-jpeg, too small, bad UUID; 201 happy path stores image at `{owner}/{device}/{id}.jpg` and row with top3; 200 idempotent replay; manual trigger clears request, patrol does not; 429 after burst; 503 when store raises; `/v1/device/state` returns state + `server_time` and throttles `touch_last_seen`; `/healthz`.
- [ ] Write tests → run `C:\Users\Ritvik\.venvs\agribot-api\Scripts\python -m pytest api/tests -v` → FAIL.
- [ ] Implement modules → same command → PASS.
- [ ] `Dockerfile` (python:3.11-slim, non-root user 1000, port 7860, `uvicorn app.main:app`), Space card `README.md` front matter (`sdk: docker`, `app_port: 7860`).
- [ ] Local smoke: run uvicorn with an in-memory store + real ONNX, POST a fixture → 201 with a label.
- [ ] Commit `feat(api): inference service with device auth, idempotency, rate limits`.

### Task 5: Camera firmware
**Files:** `firmware/camera/agribot_camera/agribot_camera.ino`, `ca_cert.h`, `docs/firmware.md`
- [ ] Implement per spec §6.1 (VGA, PSRAM, WiFiManager portal on first boot / double reset, NVS config, pinned CA, 2 s state poll, streamed raw-JPEG upload with UUID + trigger headers, retry/backoff, 60 s Wi-Fi reboot, LED codes).
- [ ] Compile: `arduino-cli compile --fqbn esp32:esp32:esp32cam firmware/camera/agribot_camera` → success.
- [ ] Commit `feat(firmware): camera v2`.

### Task 6: Drive firmware
**Files:** `firmware/drive/agribot_drive/agribot_drive.ino`, `docs/wiring.md`
- [ ] Same pins/commands as `bluetoothcar.ino`; act only on `available()`; STATE (D7) LOW → stop and ignore; optional `CMD_TIMEOUT_MS`.
- [ ] Compile: `arduino-cli compile --fqbn arduino:avr:uno firmware/drive/agribot_drive` → success.
- [ ] Commit `feat(firmware): drive failsafe`.

### Task 7: Dashboard
**Interfaces:** `DataSource` = `{ signIn, signOut, session, listCaptures(filter, page), latestCaptures(n), onCapture(cb) → unsubscribe, getDevice(), onDevice(cb), requestCapture(), setPatrol(on, interval), setPlantTag(tag), deleteCapture(id), rotateToken() → string, revoke(), imageUrl(path) → Promise<string> }`; implementations `supabaseSource` and `replaySource` (field captures from v1, clearly bannered **REPLAY**).
**Tests (Vitest):** `isOnline(lastSeen, now)`, `captureRequestStatus(requestedAt, now)`, `confidenceView(c)` (uncertain < 0.6), remedy lookup covers all 10 labels.
- [ ] Design direction chosen and applied (see `web/DESIGN.md`).
- [ ] Screens: Login, Live, History, Device. Browser-verified with `replaySource`.
- [ ] `pages.yml` builds with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` repo variables.
- [ ] Commit `feat(web): dashboard PWA`.

### Task 8: Ritvik's setup guide + runbook
**Files:** `docs/SETUP.md`, `docs/demo-runbook.md`
- [ ] SETUP: decommission v1 → Supabase project + migration + disable signups + create user → HF Space + secrets → GitHub repo + Pages variables → `create_device` token → flash camera + portal → flash drive + STATE wire → acceptance test (20 captures, ≤ 5 s).
- [ ] Commit `docs: setup guide and demo runbook`.

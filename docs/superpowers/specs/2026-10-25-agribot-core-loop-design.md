# AgriBot v2 — Core Loop Design

**Date:** 2026-10-25
**Status:** Approved in brainstorming, pending written-spec review
**Deadline:** competition demo in under 2 weeks

## 1. Goal

Replace the old laptop-bound pipeline (ESP32-CAM → Apps Script → Drive + Sheet → Python polling a published CSV every 5 s) with a cloud system that:

- runs with no laptop left on,
- is controlled and viewed from any device through one logged-in dashboard,
- holds no secrets in source code or firmware,
- gives correct predictions from the existing model (fixed preprocessing, higher-resolution capture),
- survives a live competition demo on a phone hotspot.

## 2. Context (from the 2026-10-25 audit)

| Defect in v1 | Fix in this design |
|---|---|
| Model fed `x/255`; Teachable Machine expects `x/127.5 − 1` | API preprocessing per §6.3, verified by `eval.py` (§6.4) |
| ESP32 captured 160×120 @ JPEG q25 because base64 + `String` copies exhausted heap | Stream raw JPEG from frame buffer at 640×480 (§6.1) |
| `.h5` fails to load on Keras 3 (`DepthwiseConv2D` `groups`) | One-time conversion to ONNX with pinned TF 2.15 (§6.4) |
| Laptop polling a published CSV every 5 s; 10+ restarts in 3 days | Event-driven API; no polling of data stores |
| Mixed confidence units and label casing in the sheet | Fixed schema: `label` enum keys, `confidence` always 0–1 |
| Apps Script write URL public in GitHub; published sheet readable by anyone | Device tokens, RLS, private storage, old system decommissioned (§9) |
| WiFi passwords and API keys hardcoded | WiFiManager portal + NVS on device; secrets only in host secret stores |
| `setInsecure()` TLS | Root CA pinned in firmware (§6.1) |
| `/stream` blocked the single-threaded web server | ESP32 local web UI removed; dashboard is the only UI |
| `p<millis>.jpg` filenames collide after reboot | Device-generated UUIDv4 capture IDs, idempotent on server |
| Bluetooth drive keeps last command forever on link loss | HC-05 STATE-pin failsafe (§6.2) |
| Model has no "not a leaf" answer; the 151 v1 captures were rooms/ceilings, all called blight (found in `model/EVAL.md`) | Leaf check + `verdict` (§6.3); AWB warm-up frames (§6.1) |

## 3. Scope

**In:** Supabase schema + RLS, inference API, model conversion + evaluation, camera firmware, drive failsafe firmware, dashboard PWA, demo runbook, decommission of v1, deck truth pass.

**Out (later sub-projects):** model retraining, maps/GPS, multiple users, on-device offline queue, Wi-Fi drive control, merging drive and camera onto one board.

## 4. Success criteria

1. Pressing **Capture** on the phone dashboard shows the result on the dashboard in **≤ 5 s** over a phone hotspot.
2. **20 consecutive** manual captures succeed with no failure.
3. No secret appears in the repo, firmware source, or web bundle (secret scan passes before first push).
4. An anonymous client and a second test user can read **nothing**; clients cannot insert captures (RLS test script passes).
5. Motors stop within 100 ms of the HC-05 reporting disconnect (STATE LOW), tested by disconnecting the phone mid-drive. Out-of-range loss is detected only after the HC-05's own link-supervision timeout (seconds); that limit is documented in `docs/wiring.md`, not hidden.
6. `eval.py` reports accuracy on a labelled set, and the deck quotes that number with its source.

## 5. Architecture

```
ESP32-CAM ──HTTPS POST /v1/captures (raw JPEG, X-Device-Token, X-Capture-Id, X-Trigger)──▶ API
   ▲                                                                                       │
   └──────── GET /v1/device/state every 2 s ◀──────────────────────────────────────────────┤
                                                                                           ▼
                              Supabase: Postgres (devices, device_state, captures)
                                        Storage (private bucket `captures`)
                                        Auth (single user, signups disabled)
                                        Realtime (captures, devices)
                                                                                           ▲
Dashboard PWA (GitHub Pages, Supabase Auth login) ─────── reads via RLS, writes device_state

Uno + HC-05 ◀── phone Bluetooth app (drive), STATE pin failsafe   [independent of the cloud]
```

Hosting: API on a **public** Hugging Face Space (Docker SDK, port 7860) — it must be public so the ESP32 can reach it without an HF token; the API enforces its own device-token auth and the Space holds no secrets in code. Dashboard on GitHub Pages from a **public** `agribot` repo (contains no secrets by construction).

## 6. Components

### 6.1 Camera firmware — `firmware/camera/`

- Board: AI-Thinker ESP32-CAM (pins as in v1). Arduino core for ESP32.
- Camera: `FRAMESIZE_VGA` (640×480), `jpeg_quality = 12`, frame buffer in PSRAM, `fb_count = 2`, `CAMERA_GRAB_LATEST`. Abort with LED error code if `psramFound()` is false.
- White balance: auto white balance and exposure on; discard 5 frames after init and 1 stale frame before every capture, so AWB has settled (v1 frames show the OV2640's yellow-green start-up tint).
- Provisioning: WiFiManager captive portal **"AgriBot-Setup"**, opened on first boot (no saved config) or on a **double reset** (RST pressed twice within 3 s, detected with an NVS flag). GPIO 0 is not used as a trigger: holding it low at reset enters the bootloader, and the AI-Thinker board has no BOOT button once off the programmer. Custom fields: API base URL, device token. Values persisted in NVS via `Preferences`. Nothing configurable lives in source.
- TLS: `WiFiClientSecure` with the API host's root CA embedded as PEM in `ca_cert.h` (public data, not a secret). The implementation records which CA and its expiry in `docs/firmware.md`.
- Main loop:
  - every 2 s: `GET /v1/device/state`.
  - capture when `capture_requested_at` is non-null, newer than the last one handled, and no more than 30 s older than `server_time`; or when `patrol_on` and `patrol_interval_s` has elapsed since the last capture.
  - upload: `POST /v1/captures`, `Content-Type: image/jpeg`, body streamed directly from `fb->buf` (no base64, no `String` copy). Headers `X-Device-Token`, `X-Capture-Id` (UUIDv4 from `esp_random()`), `X-Trigger: manual|patrol`.
  - retries: up to 3 attempts on network error, 429, or 5xx, with backoff 1 s / 2 s / 4 s, reusing the same capture ID. No retry on other 4xx.
  - on 401/403: LED code, state polling backs off to every 30 s.
- Resilience: reboot if Wi-Fi is disconnected for 60 s.
- Status LED (GPIO 33, active low): fast blink = connecting, 1 blink = upload OK, 3 blinks = upload failed, slow double blink = auth rejected. Flash LED (GPIO 4) stays off.

### 6.2 Drive firmware — `firmware/drive/`

- Board: Arduino Uno + HC-05 on `SoftwareSerial(10, 11)`, motor pins 12/13/14/15 — unchanged from `bluetoothcar.ino`, so the existing phone app keeps working.
- Commands unchanged: `1` forward, `2` backward, `3` right, `4` left, `0` stop.
- Fix: act only when `bt.available() > 0`.
- Failsafe: HC-05 STATE pin wired to Uno **D7** (`INPUT`). When STATE reads LOW (link lost), call `stop()` immediately and ignore commands until it reads HIGH again.
- Optional command timeout `CMD_TIMEOUT_MS` (default `0` = disabled): if non-zero, stop when no command has arrived for that long. Enable only if the phone app repeats commands while a button is held.
- Wiring change documented in `docs/wiring.md`.

### 6.3 Inference API — `api/`

Python 3.11, FastAPI, `onnxruntime`, `Pillow`, `numpy`, `httpx` (Supabase REST + Storage). Model loaded once at startup.

**Config (HF Space secrets/variables):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MODEL_PATH`, `MODEL_VERSION` (`tomato-tm-v1`), `LOW_CONFIDENCE_THRESHOLD` (default `0.6`), `MIN_LEAF_FRACTION` (default `0.10`).

**Device auth:** header `X-Device-Token`. Look up `sha256_hex(token)` in `devices.token_hash`; cache hits for 60 s. Unknown → 401. `revoked_at` set → 403.

**`POST /v1/captures`**
1. Auth device.
2. Rate limit per device: token bucket, 1 capture / 2 s, burst 3; plus 2000 / UTC day. Exceeded → 429.
3. Validate: `Content-Type: image/jpeg` else 415; body ≤ 2 MB else 413; JPEG magic bytes + Pillow decode, min side ≥ 96 px, else 422. `X-Capture-Id` must be a UUID else 422.
4. Idempotency: if a capture with this ID exists for this device, return 200 with the stored result.
5. Preprocess: EXIF transpose → RGB → `ImageOps.fit(img, (224, 224), Image.LANCZOS)` (centre crop) → `float32` → `x / 127.5 − 1` → shape `[1, 224, 224, 3]`.
6. Infer with ONNX; softmax output of 10 classes; take top 3.
7. Leaf check: `leaf_fraction` = share of plant-coloured pixels (hue 25–160°, saturation ≥ 0.20, value ≥ 0.15) after grey-world white balance on the 224×224 crop. Verdict: `no_leaf` if `leaf_fraction < MIN_LEAF_FRACTION` (0.10), else `uncertain` if confidence < 0.6, else `confident`. Same function as `model/preprocess.leaf_fraction`.
8. Upload image to Storage bucket `captures` at `{owner_id}/{device_id}/{capture_id}.jpg`.
9. Read `device_state.plant_tag`; insert `captures` row.
10. If `X-Trigger: manual`, set `device_state.capture_requested_at = null`.
11. Respond 201: `{ "id", "label", "confidence", "verdict", "leaf_fraction", "top3": [{"label", "confidence"}] }`.
12. Storage or DB failure → 503 (device retries with the same ID).

**`GET /v1/device/state`** → 200 `{ "capture_requested_at": ISO8601|null, "patrol_on": bool, "patrol_interval_s": int, "server_time": ISO8601 }`. Updates `devices.last_seen_at` (at most once per 5 s per device).

**`GET /healthz`** → 200 `{ "ok": true, "model_version": "..." }`. Used to wake the Space.

Logging: method, path, status, device ID, latency. Never log image bytes or tokens.

Code layout keeps Supabase access behind a small interface (`store.py`: `get_device_by_token_hash`, `get_capture`, `put_image`, `insert_capture`, `get_state`, `clear_capture_request`, `touch_last_seen`) so tests can substitute a fake.

### 6.4 Model — `model/`

- `convert.py`: runs in its own venv with `tensorflow==2.15.*` and `tf2onnx`; loads `keras_model.h5`, writes `agribot_tomato_v1.onnx`. Run once; the ONNX file is committed.
- `labels.json`, index order 0–9: `bacterial_spot, early_blight, healthy, late_blight, leaf_mold, mosaic_virus, septoria_leaf_spot, spider_mites, target_spot, yellow_leaf_curl_virus` (fixes the v1 "mosiac" typo).
- `fixtures/`: 10 PlantVillage images, one per class, each ≤ 50 KB.
- Parity test: Keras vs ONNX softmax outputs on fixtures, max absolute difference ≤ 1e-4.
- `eval.py --data <folder> --preprocess {tm,legacy,both}`: folder of `<label>/*.jpg`; prints per-class and overall accuracy. `tm` = §6.3 preprocessing, `legacy` = v1's resize + `/255`.
  - **Gate:** on fixtures plus a 100-image PlantVillage sample (10/class), `tm` must beat `legacy`. If it does not, stop and revisit the preprocessing before building the API on it.
  - Report lab accuracy (PlantVillage sample) and, if ≥ 20 real tomato-leaf photos are collected, field accuracy separately.

### 6.5 Database — `supabase/migrations/`

Extensions: `pgcrypto`.

```sql
devices(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id),
  name text not null,
  token_hash text unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz
)

device_state(
  device_id uuid primary key references devices(id) on delete cascade,
  owner uuid not null references auth.users(id),
  patrol_on boolean not null default false,
  patrol_interval_s int not null default 10 check (patrol_interval_s between 3 and 300),
  capture_requested_at timestamptz,
  plant_tag text check (char_length(plant_tag) <= 40),
  updated_at timestamptz not null default now()
)

captures(
  id uuid primary key,                       -- device-generated capture ID
  device_id uuid not null references devices(id) on delete cascade,
  owner uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  image_path text not null,
  label text not null check (label in ('bacterial_spot','early_blight','healthy','late_blight','leaf_mold',
                                       'mosaic_virus','septoria_leaf_spot','spider_mites','target_spot',
                                       'yellow_leaf_curl_virus')),
  confidence real not null check (confidence between 0 and 1),
  verdict text not null check (verdict in ('confident','uncertain','no_leaf')),
  leaf_fraction real not null check (leaf_fraction between 0 and 1),
  top3 jsonb not null,
  model_version text not null,
  plant_tag text
)
```

**RLS (enabled on all three):**
- `devices`: `select`, `update (name, revoked_at)`, `delete` where `owner = auth.uid()`. No client `insert`.
- `device_state`: `select`, `update` where `owner = auth.uid()`.
- `captures`: `select`, `delete` where `owner = auth.uid()`. No client `insert`/`update`.
- Storage bucket `captures` (private): `select`/`delete` where `(storage.foldername(name))[1] = auth.uid()::text`. No client upload.

**RPCs (`security definer`, check `auth.uid()`):**
- `create_device(name text) returns text` — inserts `devices` + `device_state`, generates token `agb_` + base64url(32 random bytes), stores only its SHA-256 hex, returns the plaintext token once.
- `rotate_device_token(device_id uuid) returns text` — same generation, replaces hash, clears `revoked_at`.

The API uses the service-role key and bypasses RLS. Auth: email + password, public signups disabled in project settings. Realtime enabled on `captures` and `devices`.

### 6.6 Dashboard — `web/`

React 19 + Vite + TypeScript + Tailwind v4 + `vite-plugin-pwa` + `@supabase/supabase-js`. Deployed to GitHub Pages by a GitHub Actions workflow. Uses the Supabase URL and anon key only.

- **Login:** email + password; no signup UI.
- **Live:**
  - rover status: online if `last_seen_at` < 10 s ago, else "offline · last seen <relative time>".
  - **Capture** button → `update device_state set capture_requested_at = now()`; shows "requested, not received" if still non-null after 15 s.
  - Patrol toggle + interval (3–300 s); plant-tag text field.
  - latest result card: image (signed URL, 10 min expiry), label, confidence bar, remedy text. By `verdict`: `confident` → label + remedy; `uncertain` → **"Uncertain — retake"** instead of the remedy; `no_leaf` → **"No leaf in frame"**, no label shown.
  - live feed of recent captures via Realtime `INSERT` subscription.
- **History:** paginated list, filter by label and plant tag, delete capture (row + image).
- **Device:** name, last seen, **New token** (calls `rotate_device_token`, shows token once with copy button), **Revoke**.
- Remedies: `remedies.ts` lookup keyed by label (text carried over from v1 `REMEDY_MAP`), with a fixed footer: "Confirm with a local agricultural extension officer before applying any chemical treatment."

## 7. Error handling

| Failure | Behaviour |
|---|---|
| Hotspot drops | ESP32 reconnects; reboots after 60 s down. Dashboard shows offline after 10 s without `last_seen_at`. Requests older than 30 s are ignored on reconnect. |
| Space cold | ESP32 HTTP timeout 20 s, then retry policy (§6.1). Runbook wakes the Space the day before. |
| Upload fails after 3 tries | LED failure code; dashboard shows "requested, not received". |
| Not a leaf (leaf fraction < 0.10) | Result stored with `verdict = no_leaf`; dashboard shows "No leaf in frame". |
| Low confidence (< 0.6) | Result stored with `verdict = uncertain`; dashboard shows "Uncertain — retake" instead of a remedy. |
| Invalid image | 413 / 415 / 422; logged; no retry. |
| Revoked or unknown token | 401 / 403; LED code; polling backs off to 30 s. |
| Storage/DB down | 503; device retries with same capture ID; idempotency prevents duplicates. |
| Bluetooth link lost | Motors stop via STATE pin. |

## 8. Testing

- **API (pytest, fake store):** preprocessing against golden values; token valid / unknown / revoked; content-type, size, decode, min-size rejections; idempotent replay returns 200 with stored result; rate-limit 429; manual trigger clears the request; 503 on store failure.
- **Model:** parity test (§6.4); `eval.py` gate (§6.4).
- **Database:** `supabase/tests/rls_check.py` against the real project with two test users: anon reads nothing; user B reads none of user A's rows or images; client insert into `captures` fails; `create_device` returns a token whose hash, not plaintext, is stored.
- **Dashboard:** Vitest for pure logic (online/offline rule, confidence display, remedy lookup); login, live feed, Capture, and token flows verified in a browser.
- **Firmware:** bench checklist in `docs/firmware.md` via serial log: portal → Wi-Fi → state poll → capture → row visible < 5 s → revoke token → LED auth code. Drive: unpair phone mid-drive → motors stop.
- **Acceptance:** success criteria §4 on the phone hotspot.
- **Secret scan:** `gitleaks detect` over the full repo history before the first push; must report zero findings.

## 9. Decommission v1 (Ritvik's actions, day 1)

1. Apps Script: delete all web-app deployments (the three `script.google.com/macros/s/AKfy…` URLs) in the account that owns them.
2. Google Sheet: File → Share → Publish to web → **Stop publishing**.
3. GitHub: make `RitvikModani/agrobot-final` private.
4. Google Cloud Console: delete the service-account key behind `service_account.json`; delete the file from Drive.
5. Kindwise: revoke the API key in `auto_flypix.py`; delete the file.
6. Drive: delete the uploaded `.venv` folder.

## 10. Build order

| Day | Work |
|---|---|
| 1 | §9 decommission (Ritvik). Supabase project, migrations, RLS check script. Model conversion, parity test, `eval.py` gate. |
| 2–4 | API with tests; deploy to HF Space; `/healthz` live. |
| 5–6 | Camera firmware; bench checklist. |
| 7–9 | Dashboard; GitHub Pages deploy. |
| 10 | Drive failsafe firmware + STATE wire. |
| 11–12 | Full rehearsals on hotspot; accuracy numbers; deck truth pass. |
| 13–14 | Buffer. |

## 11. Demo runbook — `docs/demo-runbook.md`

- **Day before:** open the dashboard (wakes Supabase), call `/healthz` (wakes the Space), one full dry run on the hotspot.
- **On site:** hotspot on → rover powered → dashboard logged in on phone and laptop → test capture on a printed tomato-leaf photo (venues rarely have tomato plants).
- **Fallback:** recorded video of a good run; real history already in the dashboard.

## 12. Deck truth pass

Update slides so every claim matches this system: cloud architecture (not "no internet"); 10 tomato disease classes (not "healthy or diseased" or "14 crops"); accuracy numbers from `model/EVAL.md` with their source (78.5% lab sample, no field accuracy yet); v1 captures were indoor bench tests, so "verified on a test plot" goes unless a real plot run happens; real prototype photos in slide 6; accurate credit for the drive firmware's origin and for anyone who helped.

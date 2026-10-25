---
title: AgriBot API
emoji: 🌱
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# AgriBot inference API

Receives JPEGs from the AgriBot ESP32-CAM, runs the tomato-disease model (ONNX), stores the image and result in Supabase.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness + model version. Call it to wake the Space. |
| `GET /v1/device/state` | `X-Device-Token` | What the rover should do (capture / patrol), server time. |
| `POST /v1/shops` | `Authorization: Bearer <Supabase session token>`, body `{label, lat, lon}` | Real nearby shops for a disease's remedy via Gemini + Google Maps grounding (cached 24 h, 10/min per user). 503 until `GEMINI_API_KEY` is set. |
| `POST /v1/captures` | `X-Device-Token`, `X-Capture-Id` (UUID), `X-Trigger` (`manual`/`patrol`), body `image/jpeg` ≤ 2 MB | Classify, store, return `{id, label, confidence, verdict, leaf_fraction, top3}`. |

**Space secrets** (Settings → Variables and secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret). Optional variables: `LOW_CONFIDENCE_THRESHOLD` (0.6), `MIN_LEAF_FRACTION` (0.10).

## Local

```
C:\Users\Ritvik\.venvs\agribot-api\Scripts\python -m pytest tests -q
set AGRIBOT_STORE=memory
set AGRIBOT_DEV_TOKEN=agb_devdevdevdevdevdevdevdevdevdevdevdevdevdevd
C:\Users\Ritvik\.venvs\agribot-api\Scripts\python -m uvicorn app.main:build_app --factory --port 7860
```

# Whole-plant diagnosis with Gemini vision

Date: 2026-10-28. Status: approved direction, spec awaiting review. Roadmap project 4, first half (the own-model half comes after the competition).

## Goal

Diagnose **any crop** from a photo of the **whole plant**, and point at the sick leaves, instead of classifying one tomato leaf held 20 cm from the lens. Keep the first result on screen in under 5 s.

## Decisions

- Diagnosis engine: **Gemini vision** (`GEMINI_MODEL`, today `gemini-3.5-flash-lite`) through the Interactions API the guides already use. No training.
- The tomato ONNX model stays as the fast first result and as a **second opinion** when the plant is a tomato.
- "Zoom" is replaced by **boxes on the photo** around affected leaves. The ESP32-CAM lens is fixed; digital zoom only throws pixels away.
- Out of scope: training our own detector (YOLO on PlantDoc, after the competition), Pl@ntNet, the drive.

## 1. Flow: two speeds

1. The camera uploads a JPEG to `POST /v1/captures` as today.
2. The API runs today's fast path (decode, plant check, tomato model, store image, insert row) and replies 201. The row is inserted with `ai_status = 'pending'`, or `'skipped'` when diagnosis isn't configured or a limit is hit (section 5). Unchanged latency: the first result shows in about 4 s.
3. After replying, a background task sends the same JPEG to Gemini and **updates the row** with `ai_status = 'done'`, `ai = {…}`, `ai_model`. On failure: `ai_status = 'failed'`, `ai = {"reason": "<short, safe text>"}`.
4. The dashboard receives the row UPDATE over realtime and redraws the card. Expected extra wait: 2–4 s.

## 2. Gemini request and result

- Body: `input = [{"type": "text", "text": <prompt>}, {"type": "image", "data": <base64 JPEG>, "mime_type": "image/jpeg"}]`, `generation_config = {"thinking_level": "minimal"}` (Google's guidance for detection), `response_format` = the schema below. Timeout 20 s.
- Prompt: agronomist examining a photo from a field rover in `<place>` in `<month>`; identify the plant, its overall health, and each visible problem with a box around the affected leaves; boxes as `[ymin, xmin, ymax, xmax]` normalized 0–1000; at most 6 findings; if there's no plant, say so.
- Schema, **every field required** (Flash-Lite skips optional ones):

```json
{
  "plant_present": true,
  "common_name": "Chilli",
  "scientific_name": "Capsicum annuum",
  "health": "diseased",            // "healthy" | "diseased" | "unclear"
  "summary": "≤ 30 words",
  "findings": [
    {
      "problem": "Leaf curl virus",
      "kind": "disease",             // "disease" | "pest" | "nutrient" | "other"
      "severity": "moderate",        // "mild" | "moderate" | "severe"
      "box_2d": [120, 340, 410, 620],
      "advice": "≤ 30 words",
      "active_ingredient": "imidacloprid"   // "" if none applies
    }
  ]
}
```

- Validation (`parse_diagnosis`): enums checked; `box_2d` must be 4 ints, clamped to 0–1000, with `ymin < ymax` and `xmin < xmax` (otherwise the finding keeps its text and drops its box); findings capped at 6; strings capped at 200 chars. If `plant_present` is false, `findings` is emptied.
- Errors reuse the guides' safe reasons (`gemini_failure`): status plus Google's status name, never keys.

## 3. Which result the dashboard shows

| `ai_status` | Headline | Notes |
|---|---|---|
| `done`, `plant_present` false | **No plant in frame** | |
| `done`, healthy | **`<Crop>` · Healthy** | |
| `done`, diseased | **`<Crop>` · `<worst finding>`** (severity order) | numbered findings below |
| `done`, unclear | **`<Crop>` · Unclear, retake** | |
| `pending` | today's tomato verdict | "Reading the whole plant…" note |
| `failed` / `skipped` | today's tomato verdict | "Whole-plant check unavailable" note |

The tomato model's verdict appears as **"Second opinion (tomato model)"** only when `ai` says the plant is a tomato (common name contains "tomato", case-insensitive). The CaptureSteps stepper uses the headline: Treat/Buy open when there's at least one finding with advice.

## 4. Data: migration `0003_ai.sql`

```sql
alter table public.captures
  add column ai_status text not null default 'skipped'
    check (ai_status in ('pending', 'done', 'failed', 'skipped')),
  add column ai jsonb,
  add column ai_model text;
```

RLS and grants unchanged (the owner reads; the API writes with the service role). `captures` is already in the realtime publication (`0001_core.sql:170`); the dashboard adds an `UPDATE` listener beside the `INSERT` one (`web/src/data/supabaseSource.ts:186`).

## 5. API changes (`api/`)

- New `app/diagnosis.py`: `DIAGNOSIS_SCHEMA`, `build_diagnosis_prompt(place, month)`, `parse_diagnosis(interaction) -> dict`, `GeminiDiagnosis.diagnose(jpeg, place, month) -> dict` (raises `DiagnosisError` with safe messages), sharing `gemini_failure` and the timeout handling style of `guides.py`.
- `store`: `CaptureRow` gains `ai_status`; new `set_diagnosis(capture_id, status, ai, model)`; the Supabase implementation PATCHes the row.
- `main.py`: `create_capture` adds a `BackgroundTasks` job when diagnosis is configured and allowed; the job's place comes from the owner's profile region (`profiles` table, read with the service role), falling back to "India".
- Limits: `AI_DAILY_LIMIT` (default 200) and a per-device limiter of 6/min; above either, `ai_status = 'skipped'`. Free-tier limits for the key aren't published (AI Studio shows them), so 429s are expected and handled as `failed`.

## 6. Camera

Raise the capture to **1280×720** (`FRAMESIZE_HD`) when the sensor is a GC2145 in RGB565 (1.8 MB frame in PSRAM, one buffer). If the bench shows allocation failures or frame errors, fall back to **800×600** (`FRAMESIZE_SVGA`). Measure encode time and upload size on the bench; the first-result target stays under 5 s.

## 7. Dashboard

- `Capture` gains `aiStatus`, `ai`, `aiModel`; `toCapture` maps them; replay mode leaves them `skipped`.
- New `lib/diagnosis.ts`: `headline(capture)` (the table in section 3), `boxStyle(box_2d)` → percentage `top/left/width/height`.
- Live and Field-log detail: numbered terracotta outlines over the photo (from `boxStyle`; the photo keeps its full frame), numbered findings list with severity pill, advice, and a Google Maps link for `active_ingredient` near the region. "Reading the whole plant…" while pending.

## 8. Testing

- API: `parse_diagnosis` (valid, missing fields, bad enums, bad and inverted boxes, no plant), `GeminiDiagnosis` with a mock transport (timeout, 429, success), capture flow sets `pending` then `done`/`failed`, limits produce `skipped`. Existing 79 tests stay green.
- Web: `headline` for every row of the table, `boxStyle` scaling and clamping.
- Migration applied to the Supabase project, RLS check still passes.
- Bench: three real plants (one tomato, two other crops) at 60–100 cm; record headline, boxes, timings.

## Honest claims (deck)

"Whole-plant diagnosis by Google Gemini vision, cross-checked by our tomato model, behind our own plant check." Not "our AI recognises 13 crops".

# Whole-Plant Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-10-28-whole-plant-diagnosis-design.md`: Gemini vision diagnoses the whole plant in the background and the dashboard draws boxes on sick leaves.

**Architecture:** New `api/app/diagnosis.py` (prompt, schema, parser, Gemini client). The capture endpoint stays fast and queues a background diagnosis that PATCHes the row (`ai_status`, `ai`, `ai_model`). Migration `0003_ai.sql` adds the columns. The dashboard upserts rows on realtime UPDATE and renders a headline, numbered boxes and findings from `web/src/lib/diagnosis.ts`. The camera captures 1280×720 on GC2145 boards.

**Tech Stack:** FastAPI, httpx, pytest; Supabase Postgres; React 19 + TS + Vitest; ESP32 Arduino core 2.0.14.

## Global Constraints

- Every Gemini schema field is required; booleans/enums validated in `parse_diagnosis`.
- `box_2d` = `[ymin, xmin, ymax, xmax]`, normalized 0–1000, clamped; inverted boxes are dropped (finding kept).
- At most 6 findings; strings capped at 200 chars.
- Error text shown to users never includes keys (reuse `gemini_failure`).
- Gemini timeout 20 s; `generation_config.thinking_level = "minimal"`.
- `AI_DAILY_LIMIT` default 200; per-device 6/min; over either → `ai_status = 'skipped'`.
- Migration `0003_ai.sql` must be applied in Supabase **before** the API deploy (the API selects/inserts `ai_status`).
- Commands: API `cd api && C:\Users\Ritvik\.venvs\agribot-api\Scripts\python -m pytest tests -q`; web `cd web && npx vitest run && npx tsc -b`.

---

### Task 1: `diagnosis.py` — schema, prompt, parser, client

**Files:** Create `api/app/diagnosis.py`, `api/tests/test_diagnosis.py`.

**Interfaces — Produces:** `DIAGNOSIS_SCHEMA: dict`, `build_diagnosis_prompt(place: str, month: int) -> str`, `parse_diagnosis(interaction: dict) -> dict`, `class DiagnosisError(Exception)`, `class GeminiDiagnosis(api_key, model, timeout=20.0, transport=None)` with `.diagnose(jpeg: bytes, place: str, month: int) -> dict`, `class DiagnosisWriter(Protocol)`.

- [ ] Tests (write first): valid result parses; missing field → `DiagnosisError`; bad enum → error; box clamped (`[-5, 10, 1200, 900]` → `[0, 10, 1000, 900]`); inverted box dropped but finding kept; >6 findings truncated; `plant_present: false` empties findings; client: timeout → "didn't answer within 20 s", 429 → "HTTP 429", success returns parsed dict and sends the image as base64 in `input[1].data` with `mime_type: image/jpeg`; the key is in the `x-goog-api-key` header, not the URL.
- [ ] Implementation:

```python
"""Whole-plant diagnosis from one photo with Gemini vision. Messages are user-safe (no secrets)."""
from __future__ import annotations

import base64
import json
import logging
from typing import Protocol

import httpx

from .guides import MONTHS, gemini_failure

log = logging.getLogger("agribot")
TIMEOUT_S = 20.0
MAX_FINDINGS = 6
MAX_TEXT = 200
HEALTH = ("healthy", "diseased", "unclear")
KINDS = ("disease", "pest", "nutrient", "other")
SEVERITY = ("mild", "moderate", "severe")

_TEXT = {"type": "string"}
_FINDING = {
    "type": "object",
    "properties": {
        "problem": _TEXT,
        "kind": {"type": "string", "enum": list(KINDS)},
        "severity": {"type": "string", "enum": list(SEVERITY)},
        "box_2d": {"type": "array", "items": {"type": "integer"}},
        "advice": _TEXT,
        "active_ingredient": _TEXT,
    },
}
_FINDING["required"] = list(_FINDING["properties"])
DIAGNOSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "plant_present": {"type": "boolean"},
        "common_name": _TEXT,
        "scientific_name": _TEXT,
        "health": {"type": "string", "enum": list(HEALTH)},
        "summary": _TEXT,
        "findings": {"type": "array", "items": _FINDING},
    },
}
DIAGNOSIS_SCHEMA["required"] = list(DIAGNOSIS_SCHEMA["properties"])


class DiagnosisError(Exception):
    """Gemini failed or returned something unusable. The message is shown to the user."""


class DiagnosisWriter(Protocol):
    def diagnose(self, jpeg: bytes, place: str, month: int) -> dict: ...


def build_diagnosis_prompt(place: str, month: int) -> str:
    return (
        f"You are an agronomist looking at a photo taken by a small field rover in {place} in {MONTHS[month - 1]}. "
        "Identify the plant, judge its overall health, and list each visible problem (disease, pest damage, "
        "nutrient deficiency or other) with a box around the affected leaves. Boxes are [ymin, xmin, ymax, xmax] "
        "normalized to 0-1000. Give at most 6 findings, most severe first. Keep summary and advice under 30 words, "
        "and name a commonly sold active ingredient for treatment where one applies, otherwise an empty string. "
        "If there is no plant in the photo, set plant_present to false, health to unclear and findings to []. "
        "If the plant looks healthy, set health to healthy and findings to []."
    )


def _text(value: object) -> str:
    return str(value or "")[:MAX_TEXT]


def _box(raw: object) -> list[int] | None:
    if not isinstance(raw, list) or len(raw) != 4 or not all(isinstance(v, (int, float)) for v in raw):
        return None
    ymin, xmin, ymax, xmax = (max(0, min(1000, int(v))) for v in raw)
    return [ymin, xmin, ymax, xmax] if ymin < ymax and xmin < xmax else None


def parse_diagnosis(interaction: dict) -> dict:
    if not isinstance(interaction, dict):
        raise DiagnosisError("Gemini's reply wasn't an interaction.")
    status = interaction.get("status")
    if status not in (None, "completed"):
        raise DiagnosisError(f"Gemini stopped before finishing (status '{str(status)[:30]}').")
    text = "".join(
        block.get("text", "")
        for step in interaction.get("steps") or [] if step.get("type") == "model_output"
        for block in step.get("content") or [] if block.get("type") == "text"
    )
    if not text.strip():
        raise DiagnosisError("Gemini's reply had no text in it.")
    try:
        raw = json.loads(text)
    except ValueError as exc:
        raise DiagnosisError("Gemini's reply wasn't valid JSON.") from exc
    missing = [k for k in DIAGNOSIS_SCHEMA["required"] if not isinstance(raw, dict) or k not in raw]
    if missing:
        raise DiagnosisError(f"Gemini's reply is missing {', '.join(missing)}.")
    if not isinstance(raw["plant_present"], bool) or raw["health"] not in HEALTH or not isinstance(raw["findings"], list):
        raise DiagnosisError("Gemini's reply had a bad plant_present, health or findings.")
    findings = []
    for f in raw["findings"][:MAX_FINDINGS] if raw["plant_present"] else []:
        if not isinstance(f, dict) or f.get("kind") not in KINDS or f.get("severity") not in SEVERITY:
            continue
        findings.append({"problem": _text(f.get("problem")), "kind": f["kind"], "severity": f["severity"],
                         "box_2d": _box(f.get("box_2d")), "advice": _text(f.get("advice")),
                         "active_ingredient": _text(f.get("active_ingredient"))})
    return {"plant_present": raw["plant_present"], "common_name": _text(raw["common_name"]),
            "scientific_name": _text(raw["scientific_name"]), "health": raw["health"],
            "summary": _text(raw["summary"]), "findings": findings}


class GeminiDiagnosis:
    def __init__(self, api_key: str, model: str, timeout: float = TIMEOUT_S,
                 transport: httpx.BaseTransport | None = None) -> None:
        self._model = model
        self._timeout = timeout
        self._http = httpx.Client(base_url="https://generativelanguage.googleapis.com", transport=transport,
                                  headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                                  timeout=httpx.Timeout(timeout, connect=10.0))

    def diagnose(self, jpeg: bytes, place: str, month: int) -> dict:
        body = {
            "model": self._model,
            "input": [{"type": "text", "text": build_diagnosis_prompt(place, month)},
                      {"type": "image", "data": base64.b64encode(jpeg).decode(), "mime_type": "image/jpeg"}],
            "generation_config": {"thinking_level": "minimal"},
            "response_format": {"type": "text", "mime_type": "application/json", "schema": DIAGNOSIS_SCHEMA},
        }
        try:
            r = self._http.post("/v1beta/interactions", json=body)
        except httpx.TimeoutException as exc:
            raise DiagnosisError(f"Gemini didn't answer within {self._timeout:.0f} s.") from exc
        except httpx.HTTPError as exc:
            raise DiagnosisError(f"Couldn't reach Gemini ({type(exc).__name__}).") from exc
        if r.status_code >= 400:
            log.warning("gemini diagnosis HTTP %s: %s", r.status_code, r.text[:500])
            raise DiagnosisError(gemini_failure(r, self._model))
        try:
            return parse_diagnosis(r.json())
        except ValueError as exc:
            raise DiagnosisError("Gemini's reply wasn't JSON.") from exc
        except DiagnosisError:
            log.warning("unusable gemini diagnosis: %s", r.text[:1000])
            raise
```

- [ ] Run tests → pass; commit `feat(api): Gemini whole-plant diagnosis module`.

### Task 2: Store + capture flow + limits

**Files:** Modify `api/app/store.py`, `api/app/supabase_store.py`, `api/app/config.py`, `api/app/main.py`; Test `api/tests/test_capture_ai.py`.

**Interfaces — Consumes:** `DiagnosisWriter`, `DiagnosisError`. **Produces:** `CaptureRow.ai_status: str = "skipped"`; `Store.set_diagnosis(capture_id: str, status: str, ai: dict, model: str) -> None`; `Store.get_place(owner: str) -> str | None`; `create_app(..., diagnosis: DiagnosisWriter | None = None)`; `Settings.ai_daily_limit: int = 200`; capture response gains `"ai_status"`.

- [ ] Tests: with a fake diagnosis returning a result → POST returns `ai_status: "pending"`, then the row has `status done` with that result (TestClient runs background tasks before returning); fake raising `DiagnosisError("x")` → `failed` with `{"reason": "x"}`; no diagnosis configured → `skipped`, no call; 7th capture in a minute → `skipped`; place from `store.places[owner]`, else "India", passed to the fake with the clock's month; a duplicate POST of the same capture id doesn't diagnose again.
- [ ] `store.py`: add `ai_status: str = "skipped"` as the last `CaptureRow` field; protocol methods; `MemoryStore` gains `diagnoses: dict[str, tuple[str, dict, str]]`, `places: dict[str, str]`, and implementations (`set_diagnosis` honours `fail`).
- [ ] `supabase_store.py`:

```python
    def set_diagnosis(self, capture_id: str, status: str, ai: dict, model: str) -> None:
        self._request("PATCH", "/rest/v1/captures", params={"id": f"eq.{capture_id}"},
                      json={"ai_status": status, "ai": ai, "ai_model": model}, headers={"Prefer": "return=minimal"})

    def get_place(self, owner: str) -> str | None:
        rows = self._request("GET", "/rest/v1/profiles", params={
            "select": "place_name,admin1,country", "user_id": f"eq.{owner}", "limit": "1"}).json()
        if not rows:
            return None
        return ", ".join(p for p in (rows[0].get("place_name"), rows[0].get("admin1"), rows[0].get("country")) if p)
```

- [ ] `config.py`: `ai_daily_limit: int = 200`, from `AI_DAILY_LIMIT`.
- [ ] `main.py`: `ai_limiter = RateLimiter(per_second=6 / 60, burst=6, daily=settings.ai_daily_limit)`; in `analyse`, `ai_status = "pending" if diagnosis is not None and ai_limiter.allow(device.id, clock()) else "skipped"` passed into `CaptureRow`; `capture_view` adds `"ai_status"`; `create_capture` takes `background: BackgroundTasks` and, for a new row with `pending`, `background.add_task(run_diagnosis, row, body)`:

```python
    def run_diagnosis(row: CaptureRow, body: bytes) -> None:
        try:
            place = store.get_place(row.owner) or "India"
        except StoreError:
            place = "India"
        try:
            ai, status = diagnosis.diagnose(body, place, clock().month), "done"
        except DiagnosisError as exc:
            ai, status = {"reason": str(exc)}, "failed"
        try:
            store.set_diagnosis(row.id, status, ai, settings.gemini_model)
        except StoreError as exc:
            log.warning("diagnosis %s not saved: %s", row.id, exc)
        log.info("diagnosis %s %s", row.id, status)
```

`build_app`: `diagnosis = GeminiDiagnosis(settings.gemini_api_key, settings.gemini_model) if settings.gemini_api_key else None`.
- [ ] Full suite green; commit `feat(api): background whole-plant diagnosis on captures`.

### Task 3: Migration `0003_ai.sql`

**Files:** Create `supabase/migrations/0003_ai.sql` (SQL from spec §4). Ritvik pastes it into the Supabase SQL editor and runs it **before** Task 2 is deployed. Verify with an anon REST call that `captures` still returns 401/42501 (RLS intact) and, with the dashboard signed in, that rows include `ai_status`.

### Task 4: Dashboard

**Files:** Create `web/src/lib/diagnosis.ts`, `web/tests/diagnosis.test.ts`, `web/src/components/aiView.tsx`. Modify `web/src/data/types.ts`, `supabaseSource.ts`, `replaySource.ts`, `hooks/useRover.ts`, `lib/steps.ts` (+ `tests/captureSteps.test.ts`), `lib/labels.ts`, `screens/Live.tsx`, `screens/FieldLog.tsx`.

**Interfaces — Produces:** `type AiStatus = 'pending' | 'done' | 'failed' | 'skipped'`; `interface Finding { problem; kind; severity; box_2d: number[] | null; advice; active_ingredient }`; `interface Diagnosis { plant_present; common_name; scientific_name; health; summary; findings: Finding[] }`; `Capture` gains `aiStatus: AiStatus`, `ai: Diagnosis | { reason: string } | null`, `aiModel: string | null`; `diagnosisOf(c): Diagnosis | null`; `headline(c): { text: string; crop: string | null; tone: Tone; source: 'ai' | 'model'; note: string | null }`; `boxStyle(box: number[]): { top: string; left: string; width: string; height: string }`; `isTomato(c): boolean`; `ingredientMapsUrl(ingredient: string, place: string): string`.

- [ ] `diagnosis.ts` tests: every row of spec §3; worst finding by severity; `boxStyle([100, 200, 600, 900])` → `{top:'10%', left:'20%', height:'50%', width:'70%'}`; clamps out-of-range; `isTomato` case-insensitive.
- [ ] `captureSteps(request, capture)`: when `capture.aiStatus === 'done'`, Treat/Buy follow the diagnosis (findings with advice → active; healthy → "Nothing to treat"; no plant → "Retake"). Existing cases unchanged.
- [ ] `useRover` onCapture upserts by id; `supabaseSource` adds `UPDATE` on `captures` → `onCapture`; `toCapture` maps `ai_status/ai/ai_model` (default `skipped`/null).
- [ ] `aiView.tsx`: `BoxOverlay({ findings })` (absolute numbered terracotta outlines from `boxStyle`, `pointer-events-none`), `AiFindings({ capture, place })` (numbered list: problem, severity pill, advice, Maps link for `active_ingredient`), `AiNote({ capture })` ("Reading the whole plant…" / "Whole-plant check unavailable: <reason>").
- [ ] Live/FieldLog: headline from `headline()`; overlay inside `ScanFrame`; findings in the diagnosis panel; the tomato model block titled "Second opinion (tomato model)" when `source === 'ai'` and `isTomato`, hidden for other crops; Field-log tile tag uses `headline().text`.
- [ ] `npx vitest run && npx tsc -b && npx vite build`; commit `feat(web): whole-plant diagnosis with boxes and findings`.

### Task 5: Camera resolution

**Files:** Modify `firmware/camera/agribot_camera/agribot_camera.ino` (`startCamera`).
- [ ] In the GC2145 (soft JPEG) branch use `FRAMESIZE_HD`; if `esp_camera_init` fails, retry with `FRAMESIZE_SVGA`; log the size in the `[camera] ready` line.
- [ ] Flash to the ESP32-CAM (confirm the port is the CH340 camera), time three serial captures: report frame, encode, upload. If the first result exceeds 5 s, set SVGA and re-measure.
- [ ] Commit `feat(firmware): capture whole plants at 1280x720 on GC2145`.

### Task 6: Ship and bench test

- [ ] Ritvik runs `0003_ai.sql`; then push (API auto-deploys; Pages rebuilds the dashboard).
- [ ] Capture from the dashboard: row shows `pending` then `done`/`failed` within ~5 s; boxes drawn.
- [ ] Bench with real plants (tomato + two other crops, 60–100 cm): record headline, boxes, timings in `model/EVAL.md` under "Whole-plant diagnosis".

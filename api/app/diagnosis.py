"""Whole-plant diagnosis from one photo with Gemini vision. Messages are user-safe (no secrets)."""
from __future__ import annotations

import base64
import json
import logging
from typing import Protocol

import httpx

from .guides import MONTHS, gemini_failure

log = logging.getLogger("agribot")
TIMEOUT_S = 30.0  # runs after the reply, so a slow answer costs nothing visible (20 s lost 1 in 3 on the bench)
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
# Require everything: lighter models skip optional fields.
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
    """[ymin, xmin, ymax, xmax] on 0-1000, clamped; None when it isn't a usable box."""
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
            "generation_config": {"thinking_level": "minimal"},  # Google's advice for detection
            "response_format": {"type": "text", "mime_type": "application/json", "schema": DIAGNOSIS_SCHEMA},
        }
        try:
            r = self._http.post("/v1beta/interactions", json=body)
        except httpx.TimeoutException as exc:
            raise DiagnosisError(f"Gemini didn't answer within {self._timeout:.0f} s.") from exc
        except httpx.HTTPError as exc:
            raise DiagnosisError(f"Couldn't reach Gemini ({type(exc).__name__}).") from exc
        if r.status_code >= 400:
            log.warning("gemini diagnosis HTTP %s: %s", r.status_code, r.text[:500])  # full detail stays in the log
            raise DiagnosisError(gemini_failure(r, self._model))
        try:
            return parse_diagnosis(r.json())
        except ValueError as exc:  # body itself wasn't JSON
            raise DiagnosisError("Gemini's reply wasn't JSON.") from exc
        except DiagnosisError:
            log.warning("unusable gemini diagnosis: %s", r.text[:1000])
            raise

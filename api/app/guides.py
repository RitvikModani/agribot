"""Region-specific grow guides from Gemini, reasoned from the area's real climate."""
from __future__ import annotations

import json
import logging
import re
from typing import Protocol

import httpx

log = logging.getLogger("agribot")
TIMEOUT_S = 30.0
# Never let a key or a Google Cloud project number ride along in an error shown to the user.
_SECRETS = re.compile(r"AIza[\w-]{20,}|projects/\d+")
PLANT_RE = re.compile(r"^[^\W\d_]+(?:[ '\-][^\W\d_]+)*$")
PLACE_RE = re.compile(r"^[^\W\d_]+(?:[ ,'\-.]+[^\W\d_]+)*$")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_TEXT = {"type": "string"}
_LIST = {"type": "array", "items": _TEXT}
GUIDE_SCHEMA = {
    "type": "object",
    "properties": {
        "recognized": {"type": "boolean", "description": "False if the name is not a plant that can be grown."},
        "common_name": _TEXT,
        "scientific_name": _TEXT,
        "suitability": {"type": "string", "enum": ["good", "possible", "poor"]},
        "suitability_reason": _TEXT,
        "sow_months": {"type": "array", "items": {"type": "integer", "minimum": 1, "maximum": 12}},
        "days_to_harvest_min": {"type": "integer"},
        "days_to_harvest_max": {"type": "integer"},
        "sunlight": _TEXT,
        "water": _TEXT,
        "soil": _TEXT,
        "spacing": _TEXT,
        "fertiliser": _TEXT,
        "steps": {"type": "array", "items": {"type": "object", "properties": {"title": _TEXT, "detail": _TEXT},
                                              "required": ["title", "detail"]}},
        "climate_risks": _LIST,
        "pests_diseases": _LIST,
        "local_tips": _LIST,
    },
}
# Require everything: lighter models skip optional fields. For a non-plant the model fills them anyway
# and parse_guide ignores them once it sees recognized=false.
GUIDE_SCHEMA["required"] = list(GUIDE_SCHEMA["properties"])
REQUIRED_WHEN_RECOGNIZED = [k for k in GUIDE_SCHEMA["properties"] if k != "recognized"]


class GuideError(Exception):
    """Gemini failed or returned something that isn't a valid guide. The message is shown to the user, so no secrets."""


def gemini_failure(r: httpx.Response, model: str) -> str:
    """Why a Gemini call failed, in words safe to show: HTTP status, Google's status name, what to check."""
    try:
        body = r.json()
    except ValueError:
        body = None
    err = body.get("error") if isinstance(body, dict) else None
    err = err if isinstance(err, dict) else {}
    status = f"HTTP {r.status_code}" + (f" {err['status']}" if isinstance(err.get("status"), str) else "")
    if r.status_code in (401, 403):
        return f"Gemini refused the API key ({status}). Check GEMINI_API_KEY on the server."
    if r.status_code == 404:
        return f"Gemini doesn't offer model '{model}' ({status}). Check GEMINI_MODEL on the server."
    if r.status_code == 429:
        return (f"Gemini quota or rate limit hit ({status}). If it keeps happening, this model may have "
                "no free tier: try a Flash-Lite GEMINI_MODEL.")
    if r.status_code >= 500:
        return f"Gemini is having trouble ({status}). Try again in a minute."
    message = _SECRETS.sub("[redacted]", str(err.get("message", "")))[:160]
    return f"Gemini rejected the request ({status})" + (f": {message}" if message else ".")


class GuideWriter(Protocol):
    def find(self, plant: str, place: str, normals: list[dict]) -> dict: ...


def normalize_plant(name: str) -> str:
    name = name.strip()
    if not 2 <= len(name) <= 40 or not PLANT_RE.match(name):
        raise ValueError("plant name must be 2-40 letters, spaces, hyphens or apostrophes")
    return name.lower()


def check_place(place: str) -> str:
    place = place.strip()
    if not 2 <= len(place) <= 80 or not PLACE_RE.match(place):
        raise ValueError("place must be a plain place name")
    return place


def build_guide_prompt(plant: str, place: str, normals: list[dict], month: int) -> str:
    rows = []
    for n in normals:
        temp = "n/a" if n["temp"] is None else f"{n['temp']:.0f} °C"
        rows.append(f"{MONTHS[n['month'] - 1]}: {temp}, {n['rain']} mm")
    table = "\n".join(rows)
    return (
        f"You are an agronomist advising a small farmer in {place}. Write a practical guide to growing "
        f"\"{plant}\" there. Base sowing months, water advice and risks on this 10-year monthly climate "
        f"(mean temperature, mean rainfall):\n{table}\n\nThe current month is {MONTHS[month - 1]}. "
        "Prefer locally common varieties and inputs. Keep every text field under 40 words and give at most 6 steps. "
        "If the name is not a real plant that can be cultivated, set \"recognized\" to false and leave the other fields empty."
    )


def parse_guide(interaction: dict) -> dict:
    status = interaction.get("status")
    if status not in (None, "completed"):
        raise GuideError(f"Gemini stopped before finishing (status '{str(status)[:30]}').")
    text = "".join(
        block.get("text", "")
        for step in interaction.get("steps") or [] if step.get("type") == "model_output"
        for block in step.get("content") or [] if block.get("type") == "text"
    )
    if not text.strip():
        raise GuideError("Gemini's reply had no text in it.")
    try:
        guide = json.loads(text)
    except ValueError as exc:
        raise GuideError("Gemini's reply wasn't valid JSON.") from exc
    if not isinstance(guide, dict) or not isinstance(guide.get("recognized"), bool):
        raise GuideError("Gemini's reply is missing 'recognized'.")
    if not guide["recognized"]:
        return {"recognized": False}
    missing = [k for k in REQUIRED_WHEN_RECOGNIZED if k not in guide]
    if missing:
        raise GuideError(f"Gemini's reply is missing {', '.join(missing)}.")
    if guide["suitability"] not in ("good", "possible", "poor"):
        raise GuideError("Gemini's reply had a bad suitability.")
    months = guide["sow_months"]
    if not isinstance(months, list) or not all(isinstance(m, int) and 1 <= m <= 12 for m in months):
        raise GuideError("Gemini's reply had bad sow_months.")
    guide["steps"] = guide["steps"][:6]
    return guide


class GeminiGuides:
    def __init__(self, api_key: str, model: str, timeout: float = TIMEOUT_S,
                 transport: httpx.BaseTransport | None = None) -> None:
        self._model = model
        self._timeout = timeout
        self._http = httpx.Client(base_url="https://generativelanguage.googleapis.com", transport=transport,
                                  headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                                  timeout=httpx.Timeout(timeout, connect=10.0))

    def find(self, plant: str, place: str, normals: list[dict]) -> dict:
        import datetime as dt

        body = {
            "model": self._model,
            "input": build_guide_prompt(plant, place, normals, dt.date.today().month),
            "response_format": {"type": "text", "mime_type": "application/json", "schema": GUIDE_SCHEMA},
        }
        try:
            r = self._http.post("/v1beta/interactions", json=body)
        except httpx.TimeoutException as exc:
            raise GuideError(f"Gemini didn't answer within {self._timeout:.0f} s.") from exc
        except httpx.HTTPError as exc:
            raise GuideError(f"Couldn't reach Gemini ({type(exc).__name__}).") from exc
        if r.status_code >= 400:
            log.warning("gemini HTTP %s: %s", r.status_code, r.text[:500])  # full detail stays in the server log
            raise GuideError(gemini_failure(r, self._model))
        try:
            return parse_guide(r.json())
        except ValueError as exc:  # body itself wasn't JSON
            raise GuideError("Gemini's reply wasn't JSON.") from exc
        except GuideError:
            log.warning("unusable gemini reply: %s", r.text[:1000])
            raise

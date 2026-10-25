"""Region-specific grow guides from Gemini, reasoned from the area's real climate."""
from __future__ import annotations

import json
import re
from typing import Protocol

import httpx

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
    "required": ["recognized"],
}
REQUIRED_WHEN_RECOGNIZED = [k for k in GUIDE_SCHEMA["properties"] if k != "recognized"]


class GuideError(Exception):
    """Gemini failed or returned something that isn't a valid guide."""


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
        "If the name is not a real plant that can be cultivated, return only {\"recognized\": false}."
    )


def parse_guide(interaction: dict) -> dict:
    text = "".join(
        block.get("text", "")
        for step in interaction.get("steps") or [] if step.get("type") == "model_output"
        for block in step.get("content") or [] if block.get("type") == "text"
    )
    try:
        guide = json.loads(text)
    except ValueError as exc:
        raise GuideError("guide was not valid JSON") from exc
    if not isinstance(guide, dict) or not isinstance(guide.get("recognized"), bool):
        raise GuideError("guide is missing 'recognized'")
    if not guide["recognized"]:
        return {"recognized": False}
    missing = [k for k in REQUIRED_WHEN_RECOGNIZED if k not in guide]
    if missing:
        raise GuideError(f"guide is missing {missing}")
    if guide["suitability"] not in ("good", "possible", "poor"):
        raise GuideError("bad suitability")
    if not all(isinstance(m, int) and 1 <= m <= 12 for m in guide["sow_months"]):
        raise GuideError("bad sow_months")
    guide["steps"] = guide["steps"][:6]
    return guide


class GeminiGuides:
    def __init__(self, api_key: str, model: str, timeout: float = 60.0) -> None:
        self._model = model
        self._http = httpx.Client(base_url="https://generativelanguage.googleapis.com",
                                  headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, timeout=timeout)

    def find(self, plant: str, place: str, normals: list[dict]) -> dict:
        import datetime as dt

        body = {
            "model": self._model,
            "input": build_guide_prompt(plant, place, normals, dt.date.today().month),
            "response_format": {"type": "text", "mime_type": "application/json", "schema": GUIDE_SCHEMA},
        }
        try:
            r = self._http.post("/v1beta/interactions", json=body)
        except httpx.HTTPError as exc:
            raise GuideError(f"Gemini unreachable: {exc}") from exc
        if r.status_code >= 400:
            raise GuideError(f"Gemini HTTP {r.status_code}: {r.text[:200]}")
        return parse_guide(r.json())

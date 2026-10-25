"""Remedy shops near the user via Gemini Grounding with Google Maps (Interactions API).

Shops are taken only from `place_citation` annotations, so every listed shop is a
real Google Maps place; the model's own text is shown as a note, never as a list.
"""
from __future__ import annotations

from typing import Protocol

import httpx

# Active ingredients behind each remedy in the dashboard (web/src/lib/labels.ts mirrors this).
INGREDIENTS: dict[str, list[str]] = {
    "bacterial_spot": ["copper oxychloride", "copper hydroxide"],
    "early_blight": ["mancozeb", "chlorothalonil"],
    "late_blight": ["mancozeb", "chlorothalonil", "copper oxychloride"],
    "leaf_mold": ["chlorothalonil", "copper fungicide"],
    "mosaic_virus": ["neem oil", "insecticidal soap"],
    "septoria_leaf_spot": ["chlorothalonil", "copper oxychloride"],
    "spider_mites": ["neem oil", "insecticidal soap"],
    "target_spot": ["chlorothalonil", "mancozeb"],
    "yellow_leaf_curl_virus": ["yellow sticky traps", "neem oil"],
}

DISEASE_NAME: dict[str, str] = {
    "bacterial_spot": "Bacterial Spot",
    "early_blight": "Early Blight",
    "late_blight": "Late Blight",
    "leaf_mold": "Leaf Mold",
    "mosaic_virus": "Mosaic Virus",
    "septoria_leaf_spot": "Septoria Leaf Spot",
    "spider_mites": "Spider Mites",
    "target_spot": "Target Spot",
    "yellow_leaf_curl_virus": "Yellow Leaf Curl Virus",
}

MAX_SHOPS = 6


class ShopsError(Exception):
    """Gemini or Maps grounding failed."""


class ShopFinder(Protocol):
    def find(self, label: str, lat: float, lon: float) -> tuple[str, list[dict]]: ...


def build_prompt(label: str) -> str:
    if label not in INGREDIENTS:
        raise ValueError(f"no remedy ingredients for {label!r}")
    items = ", ".join(INGREDIENTS[label])
    return (
        "Find up to 5 agricultural input shops near me (pesticide and fertiliser dealers, agro service "
        f"centres, or plant nurseries) that are likely to sell {items} for treating {DISEASE_NAME[label]} "
        "on tomato plants. For each, give one short line on what kind of shop it is. Only include real "
        "places from Google Maps. Keep the whole answer under 80 words."
    )


def parse_place_citations(interaction: dict) -> tuple[str, list[dict]]:
    """Model text plus deduplicated Maps places from `place_citation` annotations."""
    texts: list[str] = []
    shops: list[dict] = []
    seen: set[str] = set()
    for step in interaction.get("steps") or []:
        if step.get("type") != "model_output":
            continue
        for block in step.get("content") or []:
            if block.get("type") != "text":
                continue
            if block.get("text"):
                texts.append(block["text"].strip())
            for note in block.get("annotations") or []:
                name, url = note.get("name"), note.get("url")
                if note.get("type") != "place_citation" or not name or not url or not str(url).startswith("https://"):
                    continue
                if url in seen or len(shops) >= MAX_SHOPS:
                    continue
                seen.add(url)
                shops.append({"name": name, "url": url})
    return "\n\n".join(texts), shops


class GeminiShops:
    def __init__(self, api_key: str, model: str, timeout: float = 45.0) -> None:
        self._model = model
        self._http = httpx.Client(
            base_url="https://generativelanguage.googleapis.com",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            timeout=timeout,
        )

    def find(self, label: str, lat: float, lon: float) -> tuple[str, list[dict]]:
        body = {
            "model": self._model,
            "input": build_prompt(label),
            "tools": [{"type": "google_maps", "latitude": lat, "longitude": lon}],
        }
        try:
            response = self._http.post("/v1beta/interactions", json=body)
        except httpx.HTTPError as exc:
            raise ShopsError(f"Gemini unreachable: {exc}") from exc
        if response.status_code >= 400:
            raise ShopsError(f"Gemini HTTP {response.status_code}: {response.text[:200]}")
        return parse_place_citations(response.json())

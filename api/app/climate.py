"""A region's 10-year monthly climate from Open-Meteo's archive (free, no key)."""
from __future__ import annotations

import datetime as dt
import time
from typing import Protocol

import httpx


class ClimateError(Exception):
    pass


class ClimateSource(Protocol):
    def normals(self, lat: float, lon: float) -> list[dict]: ...


def monthly_normals(archive: dict) -> list[dict]:
    """Mean temperature per calendar month, and mean total rain per month per year."""
    temps: list[list[float]] = [[] for _ in range(12)]
    rain: list[dict[str, float]] = [{} for _ in range(12)]
    d = archive["daily"]
    for day, t, r in zip(d["time"], d["temperature_2m_mean"], d["precipitation_sum"]):
        m, year = int(day[5:7]) - 1, day[:4]
        if t is not None:
            temps[m].append(t)
        rain[m][year] = rain[m].get(year, 0.0) + (r or 0.0)
    return [
        {
            "month": m + 1,
            "temp": round(sum(temps[m]) / len(temps[m]), 1) if temps[m] else None,
            "rain": round(sum(rain[m].values()) / len(rain[m])) if rain[m] else 0,
        }
        for m in range(12)
    ]


class OpenMeteoClimate:
    def __init__(self, ttl: float = 30 * 86_400) -> None:
        self._http = httpx.Client(base_url="https://archive-api.open-meteo.com", timeout=40)
        self._ttl = ttl
        self._cache: dict[tuple[float, float], tuple[float, list[dict]]] = {}

    def normals(self, lat: float, lon: float) -> list[dict]:
        key = (round(lat, 1), round(lon, 1))
        hit = self._cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        end = dt.date.today().year - 1
        params = {"latitude": key[0], "longitude": key[1], "start_date": f"{end - 9}-01-01", "end_date": f"{end}-12-31",
                  "daily": "temperature_2m_mean,precipitation_sum", "timezone": "auto"}
        try:
            r = self._http.get("/v1/archive", params=params)
            r.raise_for_status()
            result = monthly_normals(r.json())
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise ClimateError(f"climate archive failed: {exc}") from exc
        self._cache[key] = (time.monotonic() + self._ttl, result)
        return result

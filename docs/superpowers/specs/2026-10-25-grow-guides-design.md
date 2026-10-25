# Grow guides + plant search — design

**Date:** 2026-10-25 · **Project 3 of 4** in `docs/ROADMAP.md` · Approved in conversation.

## Goal

Search any plant and get a guide to growing it **in your region**, reasoned from that region's real 10-year climate.

## API: `POST /v1/guide`

- **Auth:** Supabase access token, same as `/v1/shops`. 10 per minute per user → 429.
- **Body:** `{plant, lat, lon, place}`. `plant`: 2–40 chars of letters, spaces, hyphens, apostrophes; `place`: up to 80 such chars plus commas. Else 422. No other user text reaches Gemini.
- **Climate:** the server fetches Open-Meteo's 10-year daily archive for the area (1 dp ≈ 10 km), reduces it to 12 monthly normals (mean °C, mean rain mm), caches 30 days.
- **Gemini:** Interactions API, `response_format: {type: "text", mime_type: "application/json", schema}`; the prompt gives the place, the monthly table and the current month. Schema fields: `recognized`, `common_name`, `scientific_name`, `suitability` (`good`/`possible`/`poor`), `suitability_reason`, `sow_months` (1–12), `days_to_harvest_min/max`, `sunlight`, `water`, `soil`, `spacing`, `fertiliser`, `steps` (≤ 6 `{title, detail}`), `climate_risks`, `pests_diseases`, `local_tips`. Output is validated; anything malformed → 502.
- **Cache:** 30 days per `(plant lowercased, lat 1 dp, lon 1 dp)`.
- **Responses:** 200 `{guide, climate, cached}` · 503 without `GEMINI_API_KEY` · 502 on Gemini or climate failure.

## Dashboard

New **Grow** tab (4th). Search box + quick picks (tomato, chilli, okra, brinjal, groundnut, cotton, paddy, maize, mango, marigold). A diagnosis offers "How to grow {crop} in {place}" → `#/grow/tomato`. Guide card: names, suitability badge + reason, a 12-month strip (rain bars, sowing months highlighted), harvest window, care grid, numbered steps, risks/pests chips, local tips, and a footer: AI-written from the region's climate; check with the local agriculture office (KVK). `recognized: false` → "That doesn't look like a plant we can grow." Replay → "needs the live backend". No region → prompt to set one.

## Testing

pytest: name validation, auth, 503, guide parse/validation (bad JSON, missing fields, out-of-range months), `recognized: false`, cache hit, climate normals reduction. Vitest: month-range wording and sowing-month helpers. Real Gemini calls untested until a key exists.

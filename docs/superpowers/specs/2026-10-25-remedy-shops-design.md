# Remedy shops near you — design

**Date:** 2026-10-25 · **Project 2 of 4** in `docs/ROADMAP.md` · Approved in conversation.

## Goal

Under a disease diagnosis, show real nearby shops likely to sell the treatment, by name, with Google Maps links.

## Source

Gemini **Grounding with Google Maps** through the Interactions API (`POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`), body `{model, input, tools: [{type: "google_maps", latitude, longitude}]}`. Shops are taken **only** from `place_citation` annotations (`name`, `url`) on `model_output` text blocks, so every listed shop is a real Maps place. Display rules followed: sources immediately after the generated text, source name shown as given, linked to its `url`, `translate="no"`. Maps grounding is English-only and not available in every region, so a plain Google Maps search link is always shown too.

## API: `POST /v1/shops`

- **Auth:** `Authorization: Bearer <Supabase access token>`, verified with `GET {SUPABASE_URL}/auth/v1/user` (cached 5 min). Unknown/expired → 401.
- **Body:** `{label, lat, lon}`; `label` must be a disease key (not `healthy`), coordinates valid → else 422.
- **Prompt:** built server-side from the label's disease name and active ingredients (`app/shops.py: INGREDIENTS`). No user text reaches Gemini.
- **Cache:** 24 h per `(label, lat 2 dp, lon 2 dp)`, in memory.
- **Rate limit:** 10 per minute per user → 429.
- **Responses:** 200 `{shops: [{name, url}] (deduped, ≤ 6), summary, ingredients, area: "lat,lon", cached: bool}` · 503 when `GEMINI_API_KEY` isn't set · 502 when Gemini fails.
- **Config:** `GEMINI_API_KEY` (secret), `GEMINI_MODEL` (default `gemini-3.8-flash`), `ALLOWED_ORIGINS` (comma list for CORS; default `http://localhost:5288`). CORS also fixes the dashboard's existing Wake API call, which browsers would otherwise block.

## Dashboard

`DataSource.findShops(label, region)`: Supabase source calls the API with the session token; Replay returns `null`. A "Where to buy" block inside the treatment of disease verdicts: **Find shops near {place}** → list of shop names linking to Maps, Gemini's note, "Call ahead to check stock". Always: **Search Google Maps** link `https://www.google.com/maps/search/?api=1&query=<first ingredient> pesticide shop near <place>`. No region → "Set your region first".

## Testing

pytest: citation parser (dedupe, ignores non-place annotations, empty), prompt (ingredients present, rejects healthy/unknown), endpoint (401 ×2, 422, 503, 200, cache hit, 502, 429, CORS preflight) with fake finder and fake user auth. Vitest: every disease has ingredients, healthy has none, Maps link built correctly. Browser: Replay shows the Maps link and the "needs live backend" note. Real Gemini calls are untested until a key exists.

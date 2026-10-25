# Region + weather — design

**Date:** 2026-10-25 · **Project 1 of 4** in `docs/ROADMAP.md` · Approved in conversation.

## Goal

Let the user choose where their field is, then make AgriBot act on that place's weather: live conditions, a 3-day outlook, which tomato diseases the coming weather favours, and when it's safe to spray a treatment. Show the region's climate so later projects (grow guides) can reuse it.

## Approach

Everything runs in the dashboard. Open-Meteo is free, keyless and allows browser requests, so there are no API or firmware changes and it works in REPLAY mode. The only backend change is a `profiles` table.

## Components

| Unit | Responsibility |
|---|---|
| `supabase/migrations/0002_profiles.sql` | `profiles(user_id pk → auth.users, place_name, admin1, country, lat, lon, timezone, updated_at)`; RLS: select/insert/update own row only. |
| `DataSource.getRegion()` / `saveRegion(r)` | Supabase: read and upsert `profiles`. Replay: `localStorage` key `agribot.region` (wrapped in try/catch). |
| `lib/geo.ts` | `searchPlaces(q)` → Open-Meteo geocoding (up to 6 results). `labelFor(lat, lon)` → Nominatim reverse lookup, falling back to "17.97°N, 79.59°E". |
| `lib/weather.ts` | `fetchForecast(region)`: current + 72 hourly + 3 daily values; cached 30 min (memory + localStorage, returned with an "as of" time when offline). `fetchClimate(region)`: 10-year daily archive → 12 monthly normals (mean temperature, rain); cached 30 days. Pure parsers `parseForecast(json)` and `monthlyNormals(json)`. |
| `lib/risk.ts` | Pure. `diseaseRisks(hours)` and `sprayWindow(hours)` (rules below). |
| `hooks/useRegion.ts` | Loads region → forecast + climate; exposes `save(region)`, loading and error state. |
| `components/weather.tsx` | `RegionPicker` (search + "Use my location"), `WeatherCard` (now + 3 days + top risks), `SprayWindow`, `ClimateBars`. |

## Risk rules (next 72 hours, hourly)

A guide built from simplified published agronomy, not a forecast model; the UI says so.

| Disease | Counted hour | Medium | High |
|---|---|---|---|
| Late blight | RH ≥ 90 % and 10–25 °C | ≥ 4 h | ≥ 10 h |
| Early blight | 24–29 °C and (rain > 0 or RH ≥ 90 %) | ≥ 3 h | ≥ 8 h |
| Septoria leaf spot | 20–25 °C and rain > 0 | ≥ 2 h | ≥ 6 h |
| Bacterial spot | 24–30 °C and rain ≥ 0.5 mm | ≥ 2 h | ≥ 6 h |
| Leaf mold | RH > 85 % and 21–24 °C | ≥ 4 h | ≥ 12 h |
| Spider mites | ≥ 30 °C and RH < 45 % | ≥ 4 h | ≥ 12 h |

Only medium and high are shown, highest first, at most three; otherwise "Low disease pressure for the next 3 days".

**Spray window** (checked in this order, first match wins): rain ≥ 0.5 mm within 24 h → hold off, spray after it clears · wind now ≥ 15 km/h → too windy · temperature now ≥ 32 °C → spray before 9 AM or after 5 PM · otherwise a good window.

## UI

- **Live:** with no region, a "Where's your field?" prompt card containing the picker. With a region, a weather card (now, 3 days, risks). Under each diagnosis's treatment, the spray-window line.
- **Rover:** "Your region" card with the place, a "Change" control (the picker) and the climate bars.
- **Ticker:** adds the current temperature and humidity.

## Errors

Open-Meteo unreachable → cached data with "as of" time, or "Weather unavailable right now". Geolocation denied → message plus search still works. Nominatim fails → coordinate label.

## Testing

Vitest table tests: every risk rule at both thresholds, ordering and the top-3 cap, every spray-window branch in priority order, `parseForecast` and `monthlyNormals` on fixture JSON. Browser: set Warangal, see the weather and risks, change region, replay mode stores locally.

## Out of scope

Shops (project 2), grow guides (project 3), model and plant ID (project 4), storing weather on captures, soil data.

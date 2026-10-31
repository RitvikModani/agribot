# Running AgriBot on your own

Everything you need without help. Phone-friendly copy: github.com/RitvikModani/agribot/blob/main/docs/demo-runbook.md

## How it fits together

```
Camera (ESP32-CAM + power bank) ──Wi-Fi──► your phone hotspot ──mobile data──► API on Render ──► Supabase (photos + results)
                                                                                     │                    │
                                                                        Gemini (whole-plant check)        ▼
                                                                                                Dashboard (any phone/laptop)
Car: your own Bluetooth car, driven from your phone app. Completely separate from the camera.
```

| Thing | Where | Log in with |
|---|---|---|
| Dashboard | https://ritvikmodani.github.io/agribot/ | your dashboard email + password |
| API (server) | dashboard.render.com → **agribot-api** | **Gmail** (`12ritviksantoshmodani12@…`), not the school account |
| Database | supabase.com → **agribot** project | your Supabase login |
| Code | github.com/RitvikModani/agribot | GitHub |

Secrets (Supabase service key, Gemini key) live **only** in Render → agribot-api → Environment. Never paste them anywhere else.

## Every time you use it

1. Phone hotspot **on**: name `Ritvik`, **2.4 GHz** (iPhone: Maximize Compatibility on), **mobile data on**.
2. Power the camera from its power bank. Red LED flickers while it joins Wi-Fi, then goes off.
3. Open the dashboard → it shows **Online** within ~10 s.
4. Point the camera at a whole plant, **60–100 cm away, in daylight**. Stop the car before capturing.
5. **Capture leaf** (or turn on Patrol). In ~5 s the photo and a quick verdict appear; a few seconds later the **whole-plant check** replaces it: crop, problems, numbered boxes on the sick leaves, advice and a "find it near you" link.

## Things you'll need to change yourself

| Task | How |
|---|---|
| **Different Wi-Fi / second hotspot** | Press the camera's **RST twice within 3 s** → join Wi-Fi **AgriBot-Setup** → 192.168.4.1 → Configure WiFi → pick the network, type its password → leave **token blank** (kept) → Save. |
| **New device token** | Dashboard → Rover → **Issue new token** (tap twice) → copy → camera portal as above → paste into Device token. Never paste the token in chat. |
| **Your region** | Dashboard → Rover → Your region → Change. Weather, disease pressure and the whole-plant check use it. |
| **Photos too bright / dark, mirrored, upside down** | Dashboard → Rover → **Camera**: Exposure −2 (darker) to +2 (brighter), Mirror, Flip. The camera picks it up within a few seconds; capture again to check. Washed out in sunlight: −1 or −2. (+2 barely brightens indoors: the camera is already at its limit there.) |
| **Gemini model / daily limit** | Render → agribot-api → Environment: `GEMINI_MODEL` (now `gemini-3.5-flash-lite`), `AI_DAILY_LIMIT` (default 200) → Save, rebuild and deploy. |
| **Code changes** | Push to `main`. Changes in `api/` deploy to Render by themselves (~1–2 min); changes in `web/` rebuild the dashboard (~1 min, GitHub Actions). |
| **Flash the camera** | Arduino IDE → open `firmware/camera/agribot_camera/agribot_camera.ino` → Board **AI Thinker ESP32-CAM** → the **USB-SERIAL CH340** port (unplug other CH340 boards first) → Upload. Serial Monitor 115200: `p` prints config, `c` captures (the log shows size, timings and `luma`, the photo's brightness 0–255), `v` logs every check-in's time. |

## Free-tier things that bite

- **Render sleeps after 15 min** with no traffic and takes ~1 min to wake. A powered camera keeps it awake. Otherwise: Rover → **Wake API** first.
- **Supabase pauses** a free project after **7 days** of no use. Sign in to the dashboard the day before any demo.
- **Gemini free tier** has unpublished rate limits. If it's busy, the card keeps the quick verdict and says "Whole-plant check unavailable"; capture again in a minute.

## The day before the event

- [ ] Sign in to the dashboard (wakes Supabase). Rover → Wake API → HTTP 200.
- [ ] Full dry run on **your hotspot**: 10 captures in a row, including one on a real diseased plant.
- [ ] Second hotspot on a **different carrier** saved in the camera (portal, above).
- [ ] Record a 60-second backup video of one full capture landing.
- [ ] Charge: power bank, car battery, phone, laptop.
- [ ] Bring 2–3 potted plants (one tomato, one with visible spots or curl).

## On site, 30 minutes before

- [ ] Hotspot on (2.4 GHz, data on) → camera on → dashboard **Online**.
- [ ] Rover → **Wake API** → HTTP 200.
- [ ] Two test captures on your plants. Patrol off.
- [ ] Dashboard open on the laptop for the judges, phone for you.

## The 90-second demo

1. "Farmers spot disease late because scouting is slow. AgriBot goes and looks."
2. Drive the car to a plant, stop, press **Capture**: scan line → quick verdict → seconds later the **whole-plant check** with boxes on the sick leaves.
3. Read one finding out: problem, severity, advice, "find it near you".
4. Point the camera at the table → **"No plant in frame"**. "It refuses to diagnose what isn't a plant. Our first version called the ceiling blight."
5. **Disease pressure** band: "It also warns you from the local weather which diseases are coming."
6. **Field log**: every capture saved, from any phone. **Grow**: a growing guide for any crop in your region.

## When things go wrong

| Problem | Do this |
|---|---|
| Rover **offline** | "Offline" means no check-in for 30 s. Hotspot on, 2.4 GHz, data on? Camera powered? It reconnects by itself and reboots after 60 s without Wi-Fi. |
| **Live** shows an old photo | Live shows the newest capture, not video. The page re-fetches when you come back to it (phone unlocked, tab reopened); if it still looks stuck, refresh. |
| Capture says **"Not received"** | Press again. Still failing: Wake API, then check mobile signal; switch to the second hotspot. |
| **"Whole-plant check unavailable"** | Gemini was slow or rate-limited. The quick verdict still stands; capture again in a minute. |
| Camera LED **2 slow blinks** | Token rejected → new token → portal (above). |
| Camera LED **solid on** | Setup portal is open (double reset or no settings). Join AgriBot-Setup and save, or wait 5 min for it to restart. |
| Camera **hot to the touch** | Normal for an ESP32-CAM up to "warm but holdable" (its radio never sleeps: sleeping made uploads 2–3× slower). Keep it out of closed boxes and direct sun. Too hot to hold for 5 s, or a smell: unplug and check the wiring. |
| Mobile data dead everywhere | Dashboard with `?replay` (`…/agribot/?replay#/live`) shows recorded samples, **say it's recorded**; or play the backup video. Open that link once **the day before, while online** (or Add to Home Screen) so the page is cached. |

## Honest answers for Q&A

- **What does the diagnosis?** Google's Gemini vision model reads the whole plant; our own tomato model gives a fast first verdict and a second opinion on tomatoes; our own plant check stops it diagnosing non-plants.
- **Accuracy?** Our tomato model: 78.5% on 200 lab photos (may overlap its training data). The whole-plant check hasn't been measured on a labelled field set yet; that's next, along with training our own detector.
- **Without internet?** No: it needs mobile data. That's the trade-off for any phone being able to see results and every capture being stored.
- **Cost?** Free tiers: Render, Supabase, GitHub Pages, Gemini.
- **Security?** Hashed per-device tokens, row-level security, private photo storage, verified HTTPS on the camera, no passwords in the code.

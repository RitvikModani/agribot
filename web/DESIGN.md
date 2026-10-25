# AgriBot dashboard — design

**Direction: field instrument.** A rover console, not a SaaS dashboard. Kinetic-brutalist structure (square corners, 2 px borders, oversized condensed uppercase, mono data) on a soil-dark ground with one acid accent. Chosen from the ui-ux-pro-max "Kinetic Brutalism" recommendation, with its generic slate palette replaced by an agricultural one.

## Tokens (`src/index.css`)

| Token | Hex | Use |
|---|---|---|
| soil | `#0b0d08` | page background |
| bed | `#13160e` | panels |
| furrow | `#2b3122` | borders, empty meter blocks |
| bone | `#eef2e3` | primary text |
| stalk | `#a3aa92` | secondary text (≈7:1 on soil) |
| chlorophyll | `#c8f031` | primary action, online, healthy |
| rust | `#ff6a2b` | disease verdicts, destructive confirm |
| pollen | `#f2c94c` | uncertain, retry, replay warning |

Verdict colour is never the only signal: every verdict also has its own words ("No leaf in frame", "Uncertain — retake", the disease name).

Type: **Archivo** variable (width axis; `.condensed` = 62.5 %) for headlines and verdicts; **JetBrains Mono** for numbers, labels and telemetry. Both bundled via Fontsource so they work offline.

## Signature elements

- **Scan frame** — square viewport, rule-of-thirds grid, lime corner brackets, a sweeping scan line while a capture is in flight.
- **Verdict stamp** — the result lands like a rubber stamp (190 ms, slight rotation), in its tone colour.
- **Confidence blocks** — ten chunky segments plus a big mono percentage.
- **Leaf meter** — shows the no-leaf threshold tick at 0.10, so the "no leaf" verdict is explainable.
- **Telemetry ticker** — marquee of rover state across the top.
- **Replay stripe** — yellow/black hazard band whenever the data isn't live.

## Practical rules

- Mobile first; bottom nav (3 items) on phones, top nav ≥1024 px. Capture sits directly under the image, in thumb reach.
- Touch targets ≥ 44 px; destructive actions need a second tap.
- `prefers-reduced-motion` stops the ticker, scan sweep, stamp and pulse.
- No emoji icons — Lucide SVGs only.

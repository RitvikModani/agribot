# AgriBot dashboard — design

**Direction: "Verdeo, still alive."** Cream, sage and terracotta, serif headings with italic accents, wave bands and line icons, after a botanical design-studio reference. The live details that carry information stay: the ticker, the scan line, the stamped verdict, the seed meter and pressed buttons. Spec: `docs/superpowers/specs/2026-10-26-verdeo-restyle-design.md`.

## Tokens (`src/index.css`)

Contrast is enforced by `tests/contrast.test.ts`: text ≥ 4.5:1, graphics ≥ 3:1. It also fails if `bg-sprout` ever sits behind text.

| Token | Hex | Use |
|---|---|---|
| paper | `#f4ede1` | page |
| card / inset | `#fbf7ef` / `#ece4d3` | cards; wells, empty seeds |
| line | `#e2d8c3` | hairlines, card borders |
| soil | `#3a3428` | text (10.6:1 on paper) |
| bark | `#6b6149` | secondary text (5.3:1) |
| loam | `#46512d` | ticker strip, text on sprout-tint, focus ring |
| moss / moss-deep | `#5e6b3e` / `#3f4a2a` | primary pill and its lip; wave bands |
| sprout | `#77874a` | graphics only: bars, dots, markers |
| sprout-tint | `#dde2c8` | chips that hold text: active tab, healthy, online |
| terracotta / terracotta-ink | `#a0532f` / `#8e4527` | disease fills / disease text and stamp ink |
| ochre / ochre-deep | `#c9963a` / `#8a5f17` | scan line and uncertain fills (behind soil text) / uncertain text |
| cream | `#fbf7ef` | text on moss, loam and terracotta |

Colour is never the only signal: every verdict also has its own words ("No leaf in frame", "Uncertain — retake", the disease name), and the stepper says each step's state to screen readers.

Type: **Fraunces** (`.display`: `SOFT 50`, `WONK 0`) for headings and big numbers, with **`.accent`** (italic Fraunces) for the second half of a heading: "Good afternoon, *Kazipet.*" **DM Sans** for body; **JetBrains Mono** only for telemetry and specimen numbers. All bundled through Fontsource so they work offline.

## Signature elements

- **Ticker strip** — a thin deep-sage band across the top with live field notes.
- **Light header** — leaf-in-circle logo, serif wordmark, outlined status pill.
- **Scan frame** — the full photo with soft 24 px corners; an ochre scan line sweeps while a capture is in flight.
- **Stamped verdict** — a card-coloured tag in tone ink with a dashed inner border, stamped onto the photo.
- **Seed meter** — confidence as ten moss seeds.
- **Pills** — primary buttons are moss pills that keep the pressed-clay lip (`.clay`).
- **Wave band** (`WaveBand`) — one moss section with wave edges per screen at most: disease pressure on Live, sowing months on Grow, the 10-year climate on Rover.
- **Capture stepper** (`CaptureSteps`) — 01 Capture → 02 Diagnose → 03 Treat → 04 Buy for the latest capture; Treat and Buy jump to the remedy and the shop finder.
- **Organic cards** (`.organic`) — uneven corners on field-log tiles. Never a mask over the photo itself.
- **Sprigs** (`Sprig`) — hand-drawn line botanicals on Login, the Grow header and empty states only.

## Practical rules

- Light theme on purpose: it stays readable in outdoor sunlight on a phone.
- Mobile first; docked bottom nav on phones, inline pill nav ≥ 1024 px. Capture sits directly under the photo, in thumb reach.
- Touch targets ≥ 44 px; destructive actions need a second tap.
- `prefers-reduced-motion` stops the ticker, scan sweep, stamp and pulse, and makes the stepper's jumps instant.
- Eyebrow labels in sentence case. Lucide SVG icons only, no emoji.

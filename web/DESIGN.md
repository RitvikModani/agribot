# AgriBot dashboard — design

**Direction: field journal.** A botanist's notebook that happens to drive a robot. Warm, textured and tactile, but with the energy of the first version (stamped verdicts, a moving ticker, chunky buttons) kept rather than flattened into a minimal app.

References: earth-tone UI palette roles (sand surfaces, terracotta highlights, olive secondary, walnut text) from [MadeGood Designs](https://madegooddesigns.com/earthy-color-palette/) and [Pixeliro's Earthy Elegance study](https://pixeliro.com/news/image-palette-ui-ux-2026-07-11-coastal-summer-palette-study); agritech patterns (greens with warm neutrals, real crop photos) from [Agrii on DesignRush](https://www.designrush.com/best-designs/apps/agrii-app-design) and [Dribbble's Terra Field Monitoring collection](https://dribbble.com/Conceptzilla/collections/5888504-Agriculture-Terra-Field-Monitoring).

## Tokens (`src/index.css`)

| Token | Hex | Use |
|---|---|---|
| paper | `#f1e7d2` | page, with an SVG paper-grain overlay |
| card / inset | `#fbf5e7` / `#efe3c9` | cards; wells, empty meter seeds |
| line | `#d6c39f` | card borders |
| soil / loam | `#33241a` / `#4a3627` | text; header and nav band (with contour lines) |
| bark | `#6b5442` | secondary text (≈5.9:1 on paper) |
| moss / moss-deep | `#4e6a2c` / `#34481c` | primary action and its clay lip |
| sprout | `#86a35a` | healthy, online, active tab |
| terracotta | `#a64a24` | disease verdicts, destructive confirm |
| ochre / ochre-deep | `#c08a2b` / `#8a5f17` | uncertain, retry, scan line, replay stripe |

Colour is never the only signal: every verdict also has its own words ("No leaf in frame", "Uncertain — retake", the disease name).

Type: **Fraunces** (variable, `SOFT 100`, `WONK 1` via `.display`) for headings, verdicts and big numbers; **DM Sans** for body; **JetBrains Mono** only for telemetry and specimen numbers. All bundled through Fontsource so they work offline.

## Signature elements

- **Soil band** — the header and bottom nav sit on dark soil with faint terrain contour lines; the field-notes ticker runs across it.
- **Specimen frame** — the photo is mounted on a paper card with cream corner ticks; an ochre scan line sweeps while a capture is in flight.
- **Specimen label** — the verdict lands like an ink stamp: a rotated tag with a stitched (dashed) inner border, specimen number and time.
- **Seed meter** — confidence as ten seed-shaped pills.
- **Pressed clay** — primary buttons have a solid lip underneath that collapses on press (`.clay`).
- **Specimen notebook** — the field log is a grid of slightly tilted photo cards with colour tags.

## Practical rules

- Light theme on purpose: it stays readable in outdoor sunlight on a phone.
- Mobile first; docked bottom nav on phones, inline nav ≥1024 px. Capture sits directly under the photo, in thumb reach.
- Touch targets ≥ 44 px; destructive actions need a second tap.
- `prefers-reduced-motion` stops the ticker, scan sweep, stamp and pulse.
- Lucide SVG icons only, no emoji.

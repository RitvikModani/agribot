# Dashboard restyle: "Verdeo, still alive"

Date: 2026-10-26. Status: approved direction (option B), spec awaiting review.

## Goal

Restyle the whole dashboard (`web/`) after the Verdeo Atelier reference: cream, sage and terracotta, serif headings with italic accents, wave bands, line icons in circles, numbered steps, pill buttons. Keep the live details that carry information (ticker, scan line, stamped verdict, seed meter, pressed buttons).

No data, API or logic changes. Every screen keeps its current content and behaviour.

## Hard rules

1. **Photos are never cropped by decoration.** The camera frame and the field-log detail show the full frame. No blob or clip-path masks on anything a diagnosis is read from.
2. **Readable in sunlight.** Body text ≥ 4.5:1 against its background; large serif (≥ 24 px) ≥ 3:1. Enforced by a test.
3. **Light theme only.** No dark mode (unchanged decision).
4. **Touch targets ≥ 44 px**; destructive actions keep their second tap.
5. **`prefers-reduced-motion`** stops the ticker, scan sweep, stamp and pulse (unchanged), plus any new motion.
6. **Lucide icons only, no emoji** (unchanged).

## 1. Tokens (`web/src/index.css`)

Token names stay; values change. Components keep their classes.

| Token | Old | New | Used for | Contrast |
|---|---|---|---|---|
| `paper` | `#f1e7d2` | `#F4EDE1` | page | — |
| `card` | `#fbf5e7` | `#FBF7EF` | cards | — |
| `inset` | `#efe3c9` | `#ECE4D3` | wells, empty seeds | — |
| `line` | `#d6c39f` | `#E2D8C3` | hairlines, card borders | — |
| `soil` | `#33241a` | `#3A3428` | text | 10.6:1 on paper |
| `loam` | `#4a3627` | `#46512D` | ticker strip, deep sage | cream 5.9:1 |
| `bark` | `#6b5442` | `#6B6149` | secondary text | 5.3:1 on paper |
| `cream` | `#fbf5e7` | `#FBF7EF` | text on sage and terracotta | — |
| `moss` | `#4e6a2c` | `#5E6B3E` | primary pill, wave band | cream ≥ 4.9:1 |
| `moss-deep` | `#34481c` | `#3F4A2A` | pill lip | — |
| `sprout` | `#86a35a` | `#77874A` | non-text only: progress and meter bars, status dots, list markers, rain bars, `/20` tints | ≥ 3.1:1 on paper, card, inset |
| `sprout-tint` | new | `#DDE2C8` | pills and chips that hold text: active tab, healthy chip, online pill, "Grows well here" | loam 6.4:1 |
| `terracotta` | `#a64a24` | `#A0532F` | disease fills (pills, tags) | cream 4.8:1 |
| `terracotta-ink` | new | `#8E4527` | disease text, stamp ink | 6.5:1 on card |
| `ochre` | `#c08a2b` | `#C9963A` | scan line, focus ring, uncertain fills; never text | — |
| `ochre-deep` | `#8a5f17` | unchanged | uncertain text | — |

Every `bg-sprout text-soil` pair (today in `ui.tsx`, `App.tsx`, `Login.tsx`, `guide.tsx`) moves to `bg-sprout-tint text-loam`, because soil on the new mid green is only 3.4:1.

Removed: the paper-grain body background and the contour-line `.soil-band` texture.

## 2. Type

- **Fraunces** stays (already bundled with italics). `.display` drops `WONK 1` and lowers `SOFT` to 50: calmer, closer to the reference's high-contrast serif.
- New `.accent` (italic Fraunces) for the second half of headings: "Good afternoon, *Kazipet.*", "Disease *pressure*", "What will you *grow?*".
- **DM Sans** for body, **JetBrains Mono** for telemetry and specimen numbers (unchanged).
- Eyebrows (small labels above headings) get a small Lucide `Sprout` glyph and wider letter-spacing. They stay sentence case.

## 3. Chrome

- **Ticker strip:** thin `loam` band at the very top, mono text in cream, same content and marquee as today.
- **Header:** light (`paper`), leaf-in-circle logo mark plus the serif wordmark "AgriBot", the online/offline status as an outlined pill on the right. Replaces the dark soil header.
- **Bottom nav (phones):** `paper` with a hairline top border. The active tab is a `sprout` pill holding the icon and label; others are icon plus label in `bark`. Desktop (≥ 1024 px) inline nav uses the same pill style.
- **Replay stripe:** unchanged (ochre and soil hazard stripe stays: it must look like a warning).

## 4. Live details, restyled

- **Camera frame:** 24 px corners, full frame, cream chip label ("Cam 01", "Scanning…"). Corner brackets go; the ochre scan sweep stays.
- **Stamped verdict:** card-coloured tag, `terracotta-ink` outer border and dashed inner border, rotated −2.5°, same stamp animation. Healthy verdicts use `moss`, uncertain use `ochre-deep`.
- **Seed meter:** ten seeds, filled `moss`, empty `inset`.
- **Primary buttons:** pills (`rounded-full`) in `moss`, cream text, keep the `.clay` lip in `moss-deep`. Secondary buttons: outlined pills.

## 5. New Verdeo pieces

- **Wave band (`WaveBand` component):** an SVG wave edge top and bottom around a `moss` section. At most one per screen:
  - Live: the disease-pressure and spray-window block.
  - Grow: the guide's climate strip and sowing months.
  - Rover: the region's 12-month climate chart.
  - Field Log, Login: none.
- **Capture stepper (`CaptureSteps`):** under the verdict on Live. Four line-icon circles: 01 Capture, 02 Diagnose, 03 Treat, 04 Buy. State comes from the latest capture:
  - no capture: all empty;
  - capture in flight: 01 filled, 02 active;
  - verdict in: 01–02 filled;
  - diseased with a treatment: 03 and 04 become buttons that scroll to the remedy and to Where to buy.
  - healthy, no leaf, or uncertain: 03–04 stay muted with the reason ("Nothing to treat", "Retake").
- **Field Log cards:** uneven organic corners (`border-radius: 28px 18px 32px 16px`), no tilt, colour tag as a pill. The opened capture shows the full frame.
- **Botanical sprigs (`Sprig` component):** two hand-drawn single-stroke SVGs (tomato branch, leaf spray) in `line`/`bark` at low contrast, `aria-hidden`, `pointer-events: none`. Only on Login, the Grow header and empty states. Hidden below 360 px width.

## 6. Files

- `src/index.css`: tokens, `.display`, `.accent`, remove grain and `.soil-band` texture, pill and wave helpers.
- `src/components/ui.tsx`: header, ticker, nav, panel, label/eyebrow, buttons.
- New `src/components/verdeo.tsx`: `WaveBand`, `CaptureSteps`, `Sprig`.
- `src/components/weather.tsx`, `shops.tsx`, `guide.tsx`: restyle to the new tokens and pills.
- `src/screens/Live.tsx`, `FieldLog.tsx`, `Grow.tsx`, `Rover.tsx`, `Login.tsx`: layout tweaks, headings with accents, wave band placement.
- `vite.config.ts`: PWA `theme_color` to `#46512D`, `background_color` to `#F4EDE1`.
- `web/DESIGN.md`: rewritten for the new direction.

## 7. Testing

- New `tests/contrast.test.ts`: parses the `@theme` block in `index.css` and asserts the text pairs in section 1 meet 4.5:1, and `sprout` and `ochre` meet 3:1 against paper, card and inset as graphics. It also fails if any source file still pairs `bg-sprout` with text (`text-soil`, `text-loam`).
- New `tests/captureSteps.test.ts`: the step state function for no capture / in flight / healthy / diseased / no leaf / uncertain.
- Existing 26 tests pass; `tsc -b` and `vite build` are clean.
- Visual check in the browser pane at 375 px and 1280 px for every screen, in replay mode and live mode, with reduced motion on; screenshots sent to Ritvik.

## Out of scope

Dark mode, a public landing page, stock or AI photos, any API or data change, new fonts.

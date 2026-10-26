# Verdeo Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the AgriBot dashboard to the "Verdeo, still alive" direction in `docs/superpowers/specs/2026-10-26-verdeo-restyle-design.md`.

**Architecture:** Values-only token swap in `src/index.css` (names stay, so most classes keep working), one new pure function (`src/lib/steps.ts`) for the capture stepper, one new component file (`src/components/verdeo.tsx`: `WaveBand`, `CaptureSteps`, `Sprig`), then class-level restyles of the shell and screens. No data, API or hook changes.

**Tech Stack:** React 19, TypeScript, Tailwind 4 (`@theme` tokens), Vite 8, Vitest 4, lucide-react, Fontsource (Fraunces with italics already bundled).

## Global Constraints

- Photos are never cropped by decoration: camera frame and field-log detail stay full-frame (`object-cover` in a square, as today); no clip-path or blob masks.
- Body text ≥ 4.5:1 on its background; graphics ≥ 3:1. `ochre` is never text and never a graphic on paper.
- `bg-sprout` (mid green) never sits behind text; text chips use `bg-sprout-tint text-loam`.
- Light theme only. Touch targets ≥ 44 px. Destructive actions keep their second tap.
- `prefers-reduced-motion` stops ticker, scan sweep, stamp, pulse, and smooth scrolling.
- Lucide icons only, no emoji. Eyebrow labels in sentence case.
- At most one `WaveBand` per screen.
- Commands run from `web/`: `npx vitest run`, `npx tsc -b`, `npx vite build`.

---

### Task 1: Tokens, type and the contrast guard

**Files:**
- Modify: `web/src/index.css`
- Create: `web/tests/contrast.test.ts`

**Interfaces:**
- Produces: Tailwind colours `paper card inset line soil loam bark cream moss moss-deep sprout sprout-tint terracotta terracotta-ink ochre ochre-deep`; CSS classes `.display` (calmer Fraunces), `.accent` (italic Fraunces), `.organic` (uneven corners).

- [ ] **Step 1: Write the failing test** — `web/tests/contrast.test.ts`

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const TOKENS: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [text, background] pairs the UI actually uses.
const TEXT: [string, string][] = [
  ['soil', 'paper'], ['soil', 'card'], ['soil', 'inset'],
  ['bark', 'paper'], ['bark', 'card'], ['bark', 'inset'],
  ['moss', 'paper'], ['moss', 'card'],
  ['cream', 'moss'], ['cream', 'loam'], ['cream', 'terracotta'],
  ['terracotta-ink', 'paper'], ['terracotta-ink', 'card'],
  ['ochre-deep', 'card'], ['soil', 'ochre'], ['loam', 'sprout-tint'],
]
// [graphic, background]: bars, dots, rings.
const GRAPHIC: [string, string][] = [
  ['sprout', 'paper'], ['sprout', 'card'], ['sprout', 'inset'], ['moss', 'inset'], ['loam', 'paper'],
]

describe('palette contrast', () => {
  it.each(TEXT)('%s text on %s is at least 4.5:1', (fg, bg) => {
    expect(TOKENS[fg], fg).toBeDefined()
    expect(TOKENS[bg], bg).toBeDefined()
    expect(contrast(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(4.5)
  })
  it.each(GRAPHIC)('%s graphics on %s are at least 3:1', (fg, bg) => {
    expect(contrast(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(3)
  })
})

describe('sprout is never a text background', () => {
  it('no source line pairs bg-sprout with a text colour', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (p.endsWith('.tsx'))
          readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
            if (/\bbg-sprout(?![\w/-])/.test(line) && /\btext-(soil|loam|cream)\b/.test(line)) offenders.push(`${p}:${i + 1}`)
          })
      }
    }
    walk(fileURLToPath(new URL('../src', import.meta.url)))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run tests/contrast.test.ts`: `terracotta-ink`/`sprout-tint` undefined, and offenders in `ui.tsx`, `App.tsx`, `Login.tsx`, `guide.tsx`.

- [ ] **Step 3: Replace the `@theme` colours and base styles in `src/index.css`**

```css
  --color-paper: #f4ede1;
  --color-card: #fbf7ef;
  --color-inset: #ece4d3;
  --color-line: #e2d8c3;
  --color-soil: #3a3428;
  --color-loam: #46512d;
  --color-bark: #6b6149;
  --color-cream: #fbf7ef;
  --color-moss: #5e6b3e;
  --color-moss-deep: #3f4a2a;
  --color-sprout: #77874a;
  --color-sprout-tint: #dde2c8;
  --color-terracotta: #a0532f;
  --color-terracotta-ink: #8e4527;
  --color-ochre: #c9963a;
  --color-ochre-deep: #8a5f17;
```

Body: delete the paper-grain `background-image` line and its comment. `:focus-visible` outline → `var(--color-loam)`. `::selection` → `background: var(--color-sprout-tint)`. `.display` → `font-variation-settings: 'SOFT' 50, 'WONK' 0; letter-spacing: -0.02em;`. Add:

```css
/* Italic Fraunces for the second half of a heading: "Good afternoon, Kazipet." */
.accent {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-variation-settings: 'SOFT' 50, 'WONK' 0;
}

/* Uneven organic corners for log cards (never a mask over the photo itself) */
.organic {
  border-radius: 28px 18px 32px 16px;
}
```

`.paper` → `border: 1px solid var(--color-line); border-radius: 1.5rem; box-shadow: 0 1px 0 rgb(58 52 40 / 0.06);`. `.scan-sweep::before` glow → `rgb(201 150 58 / 0.55)`.

- [ ] **Step 4: Fix the four `bg-sprout … text-*` lines** (kept minimal here; later tasks restyle them fully): `ui.tsx` toneBlock healthy and StatusChip online and Nav active, `App.tsx` Wordmark, `Login.tsx` logo, `guide.tsx` SUITABILITY good and step numbers → `bg-sprout-tint text-loam`.

- [ ] **Step 5: Run** `npx vitest run` → all pass (26 old + new). If a TEXT pair fails, darken the foreground token and update the spec table.

- [ ] **Step 6: Commit** `feat(web): Verdeo tokens and contrast guard`

---

### Task 2: Capture stepper logic

**Files:**
- Create: `web/src/lib/steps.ts`
- Create: `web/tests/captureSteps.test.ts`

**Interfaces:**
- Consumes: `verdictView`, `RequestStatus`, `Verdict` from `src/lib/status.ts`; `ACTIVE_INGREDIENTS`, `LabelKey` from `src/lib/labels.ts`.
- Produces: `type StepState = 'done' | 'active' | 'todo' | 'muted'`; `interface Step { n: string; label: 'Capture' | 'Diagnose' | 'Treat' | 'Buy'; state: StepState; note?: string }`; `captureSteps(request: RequestStatus, capture?: { verdict: Verdict; label: LabelKey; confidence: number }): Step[]`.

- [ ] **Step 1: Write the failing test** — `web/tests/captureSteps.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { captureSteps } from '../src/lib/steps'

const states = (s: ReturnType<typeof captureSteps>) => s.map((x) => x.state)
const sick = { verdict: 'confident' as const, label: 'early_blight' as const, confidence: 0.9 }

describe('captureSteps', () => {
  it('is all to-do before the first capture', () => {
    expect(states(captureSteps('idle'))).toEqual(['todo', 'todo', 'todo', 'todo'])
    expect(states(captureSteps('stalled'))).toEqual(['todo', 'todo', 'todo', 'todo'])
  })
  it('shows diagnosis in progress while a capture is in flight, even over an old capture', () => {
    expect(states(captureSteps('pending'))).toEqual(['done', 'active', 'todo', 'todo'])
    expect(states(captureSteps('pending', sick))).toEqual(['done', 'active', 'todo', 'todo'])
  })
  it('opens Treat and Buy for a confident disease', () => {
    expect(states(captureSteps('idle', sick))).toEqual(['done', 'done', 'active', 'active'])
  })
  it('mutes Treat and Buy for a healthy leaf', () => {
    const s = captureSteps('idle', { verdict: 'confident', label: 'healthy', confidence: 0.95 })
    expect(states(s)).toEqual(['done', 'done', 'muted', 'muted'])
    expect(s[2].note).toBe('Nothing to treat')
  })
  it('asks for a retake when unsure or when there is no leaf', () => {
    for (const verdict of ['uncertain', 'no_leaf'] as const) {
      const s = captureSteps('idle', { verdict, label: 'late_blight', confidence: 0.4 })
      expect(states(s)).toEqual(['done', 'done', 'muted', 'muted'])
      expect(s[3].note).toBe('Retake')
    }
  })
  it('numbers the steps 01 to 04', () => {
    expect(captureSteps('idle').map((s) => `${s.n} ${s.label}`)).toEqual(['01 Capture', '02 Diagnose', '03 Treat', '04 Buy'])
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — module `../src/lib/steps` not found.

- [ ] **Step 3: Implement** — `web/src/lib/steps.ts`

```ts
import { ACTIVE_INGREDIENTS, type LabelKey } from './labels'
import { verdictView, type RequestStatus, type Verdict } from './status'

export type StepState = 'done' | 'active' | 'todo' | 'muted'
export interface Step {
  n: string
  label: 'Capture' | 'Diagnose' | 'Treat' | 'Buy'
  state: StepState
  note?: string
}

const step = (n: string, label: Step['label'], state: StepState, note?: string): Step => ({ n, label, state, note })

/** Where the latest capture is in Capture → Diagnose → Treat → Buy. */
export function captureSteps(request: RequestStatus, capture?: { verdict: Verdict; label: LabelKey; confidence: number }): Step[] {
  if (request === 'pending') return [step('01', 'Capture', 'done'), step('02', 'Diagnose', 'active'), step('03', 'Treat', 'todo'), step('04', 'Buy', 'todo')]
  if (!capture) return [step('01', 'Capture', 'todo'), step('02', 'Diagnose', 'todo'), step('03', 'Treat', 'todo'), step('04', 'Buy', 'todo')]
  const seen = [step('01', 'Capture', 'done'), step('02', 'Diagnose', 'done')]
  const tone = verdictView(capture).tone
  if (tone === 'disease') {
    const buy = ACTIVE_INGREDIENTS[capture.label].length ? step('04', 'Buy', 'active') : step('04', 'Buy', 'muted', 'Nothing to buy')
    return [...seen, step('03', 'Treat', 'active'), buy]
  }
  const note = tone === 'healthy' ? 'Nothing to treat' : 'Retake'
  return [...seen, step('03', 'Treat', 'muted', note), step('04', 'Buy', 'muted', note)]
}
```

- [ ] **Step 4: Run** `npx vitest run tests/captureSteps.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(web): capture stepper state`

---

### Task 3: Verdeo components

**Files:**
- Create: `web/src/components/verdeo.tsx`

**Interfaces:**
- Consumes: `Step`, `StepState` from `src/lib/steps.ts`.
- Produces: `WaveBand({ children, id?, className? })`, `CaptureSteps({ steps: Step[], onStep: (label: 'Treat' | 'Buy') => void })`, `Sprig({ variant?: 'branch' | 'spray', className? })`.

- [ ] **Step 1: Implement** — `web/src/components/verdeo.tsx`

```tsx
import type { ReactNode } from 'react'
import { Camera, Microscope, SprayCan, Store } from 'lucide-react'
import type { Step, StepState } from '../lib/steps'

/** A moss section with wave edges. At most one per screen. */
export function WaveBand({ children, id, className = '' }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`text-cream ${className}`}>
      <svg viewBox="0 0 400 28" preserveAspectRatio="none" className="-mb-px block h-6 w-full text-moss" aria-hidden="true">
        <path d="M0 28 C80 6 150 2 220 14 S340 30 400 8 L400 28 Z" fill="currentColor" />
      </svg>
      <div className="bg-moss px-4 py-3 sm:px-5">{children}</div>
      <svg viewBox="0 0 400 28" preserveAspectRatio="none" className="-mt-px block h-6 w-full text-moss" aria-hidden="true">
        <path d="M0 0 L400 0 L400 10 C320 28 230 26 160 14 S50 6 0 20 Z" fill="currentColor" />
      </svg>
    </section>
  )
}

const STEP_ICON = { Capture: Camera, Diagnose: Microscope, Treat: SprayCan, Buy: Store } as const
const STEP_RING: Record<StepState, string> = {
  done: 'bg-moss text-cream ring-1 ring-moss',
  active: 'bg-card text-moss ring-2 ring-moss',
  todo: 'bg-card text-bark ring-1 ring-line',
  muted: 'bg-card text-bark ring-1 ring-line',
}
const STEP_SR: Record<StepState, string> = { done: 'done', active: 'now', todo: 'not yet', muted: 'not needed' }

/** Capture → Diagnose → Treat → Buy for the latest capture. Treat and Buy jump to their sections when open. */
export function CaptureSteps({ steps, onStep }: { steps: Step[]; onStep: (label: 'Treat' | 'Buy') => void }) {
  return (
    <ol className="grid grid-cols-4 gap-1 text-center" aria-label="Latest capture progress">
      {steps.map((s) => {
        const Icon = STEP_ICON[s.label]
        const body = (
          <>
            <span className={`mx-auto grid size-12 place-items-center rounded-full ${STEP_RING[s.state]}`}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="mt-1.5 block font-mono text-[11px] text-bark">{s.n}</span>
            <span className={`block text-[13px] font-semibold ${s.state === 'done' || s.state === 'active' ? 'text-soil' : 'text-bark'}`}>{s.label}</span>
            {s.note && <span className="block text-[11px] text-bark">{s.note}</span>}
            <span className="sr-only">, {STEP_SR[s.state]}</span>
          </>
        )
        const open = s.state === 'active' && (s.label === 'Treat' || s.label === 'Buy')
        return (
          <li key={s.n}>
            {open ? (
              <button type="button" onClick={() => onStep(s.label as 'Treat' | 'Buy')} className="min-h-11 w-full cursor-pointer rounded-2xl py-1 hover:bg-inset">
                {body}
              </button>
            ) : (
              <div className="py-1" aria-current={s.state === 'active' ? 'step' : undefined}>
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Hand-drawn botanical line art. Decorative only; hidden on very narrow screens. */
export function Sprig({ variant = 'branch', className = '' }: { variant?: 'branch' | 'spray'; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none hidden text-bark/30 min-[360px]:block ${className}`}
      aria-hidden="true"
    >
      {variant === 'branch' ? (
        <>
          <path d="M60 158 C58 120 62 80 70 40 C74 24 80 12 88 4" />
          <path d="M62 120 C48 116 36 106 30 92 C44 92 56 100 62 120 Z" />
          <path d="M64 96 C78 90 88 78 92 64 C78 66 68 76 64 96 Z" />
          <path d="M67 70 C54 64 46 52 44 38 C56 42 64 52 67 70 Z" />
          <path d="M74 44 C86 38 94 28 96 16 C84 20 76 30 74 44 Z" />
          <path d="M58 130 C52 132 46 128 44 126" />
          <circle cx="40" cy="132" r="7" />
          <circle cx="52" cy="142" r="6" />
        </>
      ) : (
        <>
          <path d="M14 154 C34 118 62 78 104 28" />
          <path d="M30 128 C18 118 14 104 18 92 C28 102 32 114 30 128 Z" />
          <path d="M34 122 C48 120 60 112 66 100 C52 100 40 108 34 122 Z" />
          <path d="M50 98 C40 86 38 72 42 60 C52 70 54 84 50 98 Z" />
          <path d="M54 94 C68 92 80 84 86 72 C72 72 60 80 54 94 Z" />
          <path d="M72 72 C64 60 64 46 70 36 C78 46 78 60 72 72 Z" />
          <path d="M76 68 C90 66 100 58 106 46 C92 46 82 54 76 68 Z" />
        </>
      )}
    </svg>
  )
}
```

- [ ] **Step 2: Typecheck** `npx tsc -b` → no errors.
- [ ] **Step 3: Commit** `feat(web): WaveBand, CaptureSteps and Sprig`

---

### Task 4: Shell — ticker, header, nav, shared pieces

**Files:**
- Modify: `web/src/components/ui.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/vite.config.ts`, `web/index.html` (theme-color meta, if present)

**Interfaces:**
- Changes: `ConfidenceBlocks({ value })` loses its `tone` prop (seeds are always `moss`); callers in `Live.tsx` and `FieldLog.tsx` drop `tone=`.

- [ ] **Step 1: `ui.tsx`**
  - `toneBlock`: healthy `bg-sprout-tint text-loam`, disease `bg-terracotta text-cream`, uncertain `bg-ochre text-soil`, none `bg-card text-bark ring-1 ring-line`.
  - `toneText.disease` → `text-terracotta-ink`.
  - `Label`: drop `uppercase`; `text-[12px] font-semibold tracking-[0.08em] text-bark`; icon defaults to `Sprout` when none is passed.
  - `Ticker`: wrapper `bg-loam font-mono text-[11px] tracking-wide text-cream` (no uppercase, no `/70`).
  - `StatusChip`: rounded-full, sentence case; online `bg-sprout-tint text-loam` with `pulse-dot bg-moss`; offline `text-bark ring-1 ring-bark/40`.
  - `ScanFrame`: drop the `.paper` wrapper and the four brackets; frame is `relative aspect-square w-full overflow-hidden rounded-[1.5rem] bg-inset ring-1 ring-line`.
  - `VerdictStamp`: tag `bg-card` with `border-[1.5px] border-current` and tone ink (`text-moss` / `text-terracotta-ink` / `text-ochre-deep` / `text-bark`), shadow `0_3px_0_rgb(58_52_40/0.25)`, headline `font-semibold`.
  - `ConfidenceBlocks`: seeds `h-3.5 rounded-full`, filled `bg-moss`, empty `bg-inset ring-1 ring-inset ring-line`; remove `tone` prop.
  - `TruthLine` miss colour → `text-terracotta-ink`.
  - `Nav` docked: `safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-1 border-t border-line bg-paper/95 px-2 pt-2 backdrop-blur`; buttons `rounded-2xl` docked / `rounded-full` inline, sentence case, active `bg-sprout-tint text-loam`, idle `text-bark hover:bg-inset hover:text-soil`.
- [ ] **Step 2: `App.tsx`** — remove the soil-band wrapper; render `<Ticker />` then a light header (`pt-4`). `Wordmark`: `size-10 rounded-full ring-1 ring-moss/50 text-moss` circle with `Sprout`, `display text-[1.75rem] font-semibold` "AgriBot", subline `text-[11px] tracking-[0.08em] text-bark` "Field companion". Error alert → `text-terracotta-ink`.
- [ ] **Step 3: `index.css`** — delete `.bracket*` rules (no users left).
- [ ] **Step 4: `vite.config.ts`** — `theme_color: '#46512d'`, `background_color: '#f4ede1'`; same colour in any `<meta name="theme-color">` in `index.html`.
- [ ] **Step 5: Run** `npx tsc -b && npx vitest run` → clean.
- [ ] **Step 6: Commit** `feat(web): light Verdeo shell`

---

### Task 5: Live screen

**Files:**
- Modify: `web/src/screens/Live.tsx`, `web/src/components/weather.tsx`, `web/src/components/shops.tsx`

**Interfaces:**
- Consumes: `WaveBand`, `CaptureSteps` (Task 3), `captureSteps` (Task 2).
- Produces: `DiseasePressure({ forecast }: { forecast: Forecast | null })` exported from `weather.tsx` (split out of `WeatherCard`, styled for the moss band); `WeatherCard` no longer renders the risk list.

- [ ] **Step 1: `weather.tsx`** — move the "Disease pressure" block into `DiseasePressure`: eyebrow "Next 3 days" in cream, heading `display text-2xl` "Disease <span class="accent">pressure</span>", rows `rounded-2xl bg-cream/10`, level pill high `bg-terracotta text-cream` / medium `bg-ochre text-soil`, detail text full `text-cream`, footnote `text-[12px] italic text-cream`. Returns `null` without a forecast. `RegionPicker` GPS button → `rounded-full`; `RegionPrompt` error → `text-terracotta-ink`.
- [ ] **Step 2: `Live.tsx`**
  - Greeting heading above the grid: `Good {morning|afternoon|evening},` and `<span className="accent">{placeName ?? 'grower'}.</span>` (`display text-[2.4rem] leading-[1.05] text-loam`); morning < 12 h, afternoon < 17 h.
  - Frame chips `bg-card/90 text-moss`; "Looking closely…" `bg-card/90 text-moss`.
  - `CaptureButton`: `rounded-full`, `h-16`, label `display text-[1.6rem] font-semibold`; pending lip `[--lip:#2c341d]`; ready hover `hover:bg-[#56623a]`.
  - `Diagnosis` takes `request: RequestStatus`; renders `<CaptureSteps steps={captureSteps(request, capture)} onStep={jump} />` under the headline (also in the empty state). `jump` scrolls `#treatment` / `#where-to-buy` into view (`behavior: 'auto'` when reduced motion is on, else `'smooth'`). Ids go on the treatment block (`scroll-mt-4`) and a wrapper around `WhereToBuy`. Treatment label → `text-terracotta-ink`.
  - Under `WeatherCard`: `{region.forecast && <WaveBand><DiseasePressure forecast={region.forecast} /></WaveBand>}`.
  - Patrol `clay` buttons → `rounded-full`; `Recent` thumbs → `organic bg-card ring-1 ring-line`, image `rounded-[20px_12px_24px_10px]`.
- [ ] **Step 3: `shops.tsx`** — search button `rounded-full`; error → `text-terracotta-ink`.
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run` → clean.
- [ ] **Step 5: Commit** `feat(web): Live screen in Verdeo`

---

### Task 6: Field log, Grow, Rover, Login

**Files:**
- Modify: `web/src/screens/FieldLog.tsx`, `web/src/screens/Grow.tsx`, `web/src/components/guide.tsx`, `web/src/screens/Rover.tsx`, `web/src/components/weather.tsx` (`ClimateBars`), `web/src/screens/Login.tsx`, `web/src/index.css`

**Interfaces:**
- Changes: `ClimateBars({ normals, onBand? })`: on the band, bars are `bg-cream` (this month) / `bg-cream/40`, labels `text-cream`.

- [ ] **Step 1: FieldLog** — heading `Field <span className="accent">log</span>`; filter active `bg-loam text-cream`; counts → `text-terracotta-ink`; `Tile` loses `tilt`, becomes `organic bg-card p-2 ring-1 ring-line`, photo `rounded-[22px_12px_26px_10px]`, tag `rounded-full`; empty state with `<Sprig variant="spray" className="ml-auto h-24" />`; detail sheet `rounded-[2rem] bg-paper`, overlay `bg-soil/60`, delete hover `text-terracotta-ink ring-terracotta`, `ConfidenceBlocks` without `tone`.
- [ ] **Step 2: Grow + guide** — header gets `<Sprig className="absolute right-0 top-0 h-28" />` (header `relative`), heading `What will you <span className="accent">grow?</span>`; input and button `rounded-full`; error → `text-terracotta-ink`. In `guide.tsx` the "Your year" panel becomes a `WaveBand`: sow bars `bg-cream`, others `bg-cream/35`, month letters `text-cream`, `Fact` boxes `bg-cream/10` with cream text, caption `text-cream`.
- [ ] **Step 3: Rover** — `RegionPanel` keeps picker in its `Panel`; the climate chart moves into `<WaveBand><ClimateBars normals={…} onBand /></WaveBand>` right after it. Headings `font-semibold`; any `text-terracotta` text → `text-terracotta-ink`; buttons `rounded-full`.
- [ ] **Step 4: Login** — light hero on `paper`: `Sprig` top-right, logo ring as in `Wordmark`, `display text-6xl font-semibold` "AgriBot", tagline `Your field, <span className="accent">read leaf by leaf.</span>` in `text-loam`, body copy `text-bark`; inputs `rounded-2xl`; submit `rounded-full`; error → `text-terracotta-ink`.
- [ ] **Step 5: `index.css`** — delete `.soil-band` (no users left).
- [ ] **Step 6: Run** `npx tsc -b && npx vitest run` → clean; `grep -rn "soil-band\|bracket" src` → nothing.
- [ ] **Step 7: Commit** `feat(web): field log, grow, rover and login in Verdeo`

---

### Task 7: Docs, build and visual check

**Files:**
- Modify: `web/DESIGN.md`

- [ ] **Step 1:** Rewrite `web/DESIGN.md` for "Verdeo, still alive": token table from the spec, type, signature elements (ticker strip, scan frame, stamp, seed meter, pill buttons, wave band, stepper, organic cards, sprigs), practical rules.
- [ ] **Step 2:** `npx vitest run && npx tsc -b && npx vite build` → all clean.
- [ ] **Step 3:** Browser pane, `agribot-web` on 5288: Live, Field log (open a capture), Grow, Rover at 375 × 812 and 1280 × 800, in live mode. Check console for errors; check reduced motion stops the ticker and sweep. Screenshot each screen.
- [ ] **Step 4: Commit** `docs(web): DESIGN.md for the Verdeo direction`

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

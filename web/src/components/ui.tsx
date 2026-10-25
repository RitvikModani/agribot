import { useEffect, useState, type ReactNode } from 'react'
import { Camera, Check, ListChecks, Radio, X } from 'lucide-react'
import type { DataSource } from '../data/types'
import { LABEL_NAME, type LabelKey } from '../lib/labels'
import { confidenceBlocks, pct, type Tone, type VerdictView } from '../lib/status'

export const toneBlock: Record<Tone, string> = {
  healthy: 'bg-chlorophyll text-soil border-chlorophyll',
  disease: 'bg-rust text-soil border-rust',
  uncertain: 'bg-pollen text-soil border-pollen',
  none: 'bg-soil text-bone border-bone',
}
export const toneText: Record<Tone, string> = {
  healthy: 'text-chlorophyll',
  disease: 'text-rust',
  uncertain: 'text-pollen',
  none: 'text-stalk',
}
export const toneFill: Record<Tone, string> = {
  healthy: 'bg-chlorophyll',
  disease: 'bg-rust',
  uncertain: 'bg-pollen',
  none: 'bg-stalk',
}

export function useImageUrl(source: DataSource, path: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let live = true
    if (!path) {
      setUrl(undefined)
      return
    }
    source.imageUrl(path).then((u) => live && setUrl(u)).catch(() => live && setUrl(undefined))
    return () => {
      live = false
    }
  }, [source, path])
  return url
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-stalk ${className}`}>{children}</span>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border-2 border-furrow bg-bed p-4 ${className}`}>{children}</section>
}

export function Ticker({ items }: { items: string[] }) {
  const line = items.join('   ///   ')
  return (
    <div className="overflow-hidden whitespace-nowrap border-b-2 border-furrow bg-bed font-mono text-[12px] uppercase tracking-wider text-stalk">
      <div className="ticker-track inline-flex">
        <span className="px-4 py-1.5">{line}</span>
        <span className="px-4 py-1.5" aria-hidden="true">
          {line}
        </span>
      </div>
    </div>
  )
}

export function ReplayBanner() {
  return (
    <div className="hazard flex justify-center py-1.5">
      <span className="bg-pollen px-2 font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-soil">
        Replay<span className="hidden sm:inline"> · recorded samples</span> · not live
      </span>
    </div>
  )
}

export function StatusChip({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 border-2 px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-widest ${
        online ? 'border-chlorophyll text-chlorophyll' : 'border-furrow text-stalk'
      }`}
    >
      <span className={`size-2 ${online ? 'pulse-dot bg-chlorophyll' : 'bg-stalk'}`} aria-hidden="true" />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

export function ScanFrame({
  src,
  alt,
  scanning,
  children,
}: {
  src?: string
  alt: string
  scanning: boolean
  children?: ReactNode
}) {
  return (
    <div className="relative aspect-square w-full overflow-hidden border-2 border-furrow bg-bed">
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center">
          <Label>No frame yet</Label>
        </div>
      )}
      <div className="frame-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <span key={c} className={`bracket bracket-${c}`} aria-hidden="true" />
      ))}
      {scanning && <div className="scan-sweep" aria-hidden="true" />}
      {children}
    </div>
  )
}

export function VerdictStamp({ view, id }: { view: VerdictView; id: string }) {
  return (
    <div
      key={id}
      className={`stamp condensed inline-block max-w-[92%] border-2 px-3 py-1 font-display text-[clamp(2.1rem,9vw,4.25rem)] font-black uppercase leading-[0.92] ${toneBlock[view.tone]}`}
    >
      {view.headline}
    </div>
  )
}

export function ConfidenceBlocks({ value, tone }: { value: number; tone: Tone }) {
  const filled = confidenceBlocks(value)
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex flex-1 gap-1"
        role="meter"
        aria-label="Model confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-6 flex-1 ${i < filled ? toneFill[tone] : 'bg-furrow'}`} />
        ))}
      </div>
      <span className="w-16 text-right font-mono text-2xl font-semibold tabular-nums">{pct(value)}</span>
    </div>
  )
}

/** Plant-colour share of the frame; the API calls < 0.10 "no leaf". Scaled so 0.6 fills the bar. */
export function LeafMeter({ value }: { value: number }) {
  const width = Math.min(100, (value / 0.6) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>Leaf in frame</Label>
        <span className="font-mono text-sm tabular-nums text-stalk">{value.toFixed(2)}</span>
      </div>
      <div className="relative mt-1.5 h-2 bg-furrow">
        <div className={`h-full ${value < 0.1 ? 'bg-stalk' : 'bg-chlorophyll'}`} style={{ width: `${width}%` }} />
        <span className="absolute -top-1 h-4 w-0.5 bg-bone" style={{ left: `${(0.1 / 0.6) * 100}%` }} title="No-leaf threshold" />
      </div>
    </div>
  )
}

export function Top3({ items }: { items: { label: LabelKey; confidence: number }[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((t, i) => (
        <li key={t.label} className="grid grid-cols-[1.5rem_1fr_3.5rem] items-center gap-2">
          <span className="font-mono text-xs text-stalk">{i + 1}</span>
          <div>
            <div className="text-sm font-semibold">{LABEL_NAME[t.label]}</div>
            <div className="mt-1 h-1 bg-furrow">
              <div className={`h-full ${i === 0 ? 'bg-bone' : 'bg-stalk'}`} style={{ width: pct(t.confidence) }} />
            </div>
          </div>
          <span className="text-right font-mono text-sm tabular-nums">{pct(t.confidence)}</span>
        </li>
      ))}
    </ol>
  )
}

export function TruthLine({ truth, predicted }: { truth: LabelKey; predicted: LabelKey }) {
  const hit = truth === predicted
  return (
    <p className={`flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider ${hit ? 'text-chlorophyll' : 'text-rust'}`}>
      {hit ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
      Ground truth: {LABEL_NAME[truth]} {hit ? '· model correct' : '· model wrong'}
    </p>
  )
}

export type Tab = 'live' | 'log' | 'rover'

const TABS: { id: Tab; label: string; icon: typeof Camera }[] = [
  { id: 'live', label: 'Live', icon: Camera },
  { id: 'log', label: 'Field log', icon: ListChecks },
  { id: 'rover', label: 'Rover', icon: Radio },
]

export function Nav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Sections"
      className="safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t-2 border-furrow bg-soil lg:static lg:flex lg:gap-2 lg:border-0 lg:bg-transparent"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 font-mono text-[12px] font-bold uppercase tracking-widest transition-colors duration-150 lg:min-h-10 lg:flex-row lg:border-2 lg:px-4 ${
              active ? 'bg-chlorophyll text-soil lg:border-chlorophyll' : 'text-stalk hover:text-bone lg:border-furrow'
            }`}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

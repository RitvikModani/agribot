import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, Check, Radio, ScanLine, Sprout, X, type LucideIcon } from 'lucide-react'
import type { DataSource } from '../data/types'
import { LABEL_NAME, type LabelKey } from '../lib/labels'
import { clockTime, confidenceBlocks, pct, type Tone, type VerdictView } from '../lib/status'

/** Solid tone surfaces (specimen labels, tags). */
export const toneBlock: Record<Tone, string> = {
  healthy: 'bg-sprout text-soil',
  disease: 'bg-terracotta text-cream',
  uncertain: 'bg-ochre text-soil',
  none: 'bg-cream text-bark ring-1 ring-bark/40',
}
/** Tone as text on paper. */
export const toneText: Record<Tone, string> = {
  healthy: 'text-moss',
  disease: 'text-terracotta',
  uncertain: 'text-ochre-deep',
  none: 'text-bark',
}
export const toneFill: Record<Tone, string> = {
  healthy: 'bg-sprout',
  disease: 'bg-terracotta',
  uncertain: 'bg-ochre',
  none: 'bg-line',
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

export function Label({ children, icon: Icon, className = '' }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-bark ${className}`}>
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`paper p-4 sm:p-5 ${className}`}>{children}</section>
}

export function Ticker({ items }: { items: string[] }) {
  const line = items.join('   ·   ')
  return (
    <div className="overflow-hidden whitespace-nowrap border-b border-cream/10 font-mono text-[12px] uppercase tracking-wider text-cream/70">
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
      <span className="rounded-full bg-ochre px-3 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-soil">
        Replay<span className="hidden sm:inline"> · recorded samples</span> · not live
      </span>
    </div>
  )
}

export function StatusChip({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-wider ${
        online ? 'bg-sprout text-soil' : 'bg-cream text-bark ring-1 ring-bark/30'
      }`}
    >
      <span className={`size-2 rounded-full ${online ? 'pulse-dot bg-moss-deep' : 'bg-bark/60'}`} aria-hidden="true" />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

/** The camera viewport, framed like a mounted specimen. */
export function ScanFrame({ src, alt, scanning, children }: { src?: string; alt: string; scanning: boolean; children?: ReactNode }) {
  return (
    <div className="paper p-2.5">
      <div className="relative aspect-square w-full overflow-hidden rounded-[0.9rem] bg-inset">
        {src ? (
          <img src={src} alt={alt} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-bark">
            <div className="flex flex-col items-center gap-2">
              <Sprout className="size-10" aria-hidden="true" />
              <span className="display text-xl italic">No frame yet</span>
            </div>
          </div>
        )}
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <span key={c} className={`bracket bracket-${c}`} aria-hidden="true" />
        ))}
        {scanning && <div className="scan-sweep" aria-hidden="true" />}
        {children}
      </div>
    </div>
  )
}

/** The verdict as a botanical specimen label, stamped onto the photo. */
export function VerdictStamp({ view, id, createdAt }: { view: VerdictView; id: string; createdAt: string }) {
  return (
    <div key={id} className={`specimen inline-block max-w-[92%] rounded-xl p-1 shadow-[0_4px_0_rgb(51_36_26/0.35)] ${toneBlock[view.tone]}`}>
      <div className="specimen-inner px-3 py-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">
          Specimen {id.slice(0, 4)} · {clockTime(createdAt).slice(0, 5)}
        </div>
        <div className="display text-[clamp(1.7rem,7.5vw,3.2rem)] font-bold leading-[0.98]">{view.headline}</div>
      </div>
    </div>
  )
}

/** Confidence as a row of ten seeds. */
export function ConfidenceBlocks({ value, tone }: { value: number; tone: Tone }) {
  const filled = confidenceBlocks(value)
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex flex-1 gap-1.5"
        role="meter"
        aria-label="Model confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-4 flex-1 rounded-full ${i < filled ? toneFill[tone] : 'bg-inset ring-1 ring-inset ring-line'}`} />
        ))}
      </div>
      <span className="display w-16 text-right text-3xl font-bold tabular-nums">{pct(value)}</span>
    </div>
  )
}

/** Plant-colour share of the frame; below 0.10 the API says "no leaf". Scaled so 0.6 fills the bar. */
export function LeafMeter({ value }: { value: number }) {
  const width = Math.min(100, (value / 0.6) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label icon={Sprout}>Leaf in frame</Label>
        <span className="font-mono text-sm tabular-nums text-bark">{value.toFixed(2)}</span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-inset ring-1 ring-inset ring-line">
        <div className={`h-full rounded-full ${value < 0.1 ? 'bg-bark/50' : 'bg-sprout'}`} style={{ width: `${width}%` }} />
        <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-soil" style={{ left: `${(0.1 / 0.6) * 100}%` }} title="No-leaf threshold" />
      </div>
    </div>
  )
}

export function Top3({ items }: { items: { label: LabelKey; confidence: number }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((t, i) => (
        <li key={t.label} className="grid grid-cols-[1.5rem_1fr_3.5rem] items-center gap-2">
          <span className="display text-lg italic text-bark">{i + 1}</span>
          <div>
            <div className="text-[15px] font-semibold">{LABEL_NAME[t.label]}</div>
            <div className="mt-1 h-1.5 rounded-full bg-inset">
              <div className={`h-full rounded-full ${i === 0 ? 'bg-moss' : 'bg-bark/40'}`} style={{ width: pct(t.confidence) }} />
            </div>
          </div>
          <span className="text-right text-sm font-semibold tabular-nums text-bark">{pct(t.confidence)}</span>
        </li>
      ))}
    </ol>
  )
}

export function TruthLine({ truth, predicted }: { truth: LabelKey; predicted: LabelKey }) {
  const hit = truth === predicted
  return (
    <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${hit ? 'text-moss' : 'text-terracotta'}`}>
      {hit ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
      Ground truth: {LABEL_NAME[truth]} {hit ? '· model correct' : '· model wrong'}
    </p>
  )
}

export type Tab = 'live' | 'log' | 'rover'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'live', label: 'Live', icon: ScanLine },
  { id: 'log', label: 'Field log', icon: BookOpen },
  { id: 'rover', label: 'Rover', icon: Radio },
]

export function Nav({ tab, onTab, docked }: { tab: Tab; onTab: (t: Tab) => void; docked: boolean }) {
  return (
    <nav
      aria-label="Sections"
      className={
        docked
          ? 'soil-band safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 gap-1 border-t border-cream/10 px-2 pt-2'
          : 'flex gap-1.5'
      }
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            aria-current={active ? 'page' : undefined}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
              docked ? 'mb-2 min-h-13 flex-col' : 'min-h-10 px-4'
            } ${active ? 'bg-sprout text-soil' : 'text-cream/75 hover:bg-cream/10 hover:text-cream'}`}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

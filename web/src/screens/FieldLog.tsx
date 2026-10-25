import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Trash2, X } from 'lucide-react'
import type { Capture, DataSource } from '../data/types'
import type { RoverModel } from '../hooks/useRover'
import { LABEL_NAME, REMEDY, REMEDY_FOOTER } from '../lib/labels'
import { clockTime, verdictView, type Tone } from '../lib/status'
import { ConfidenceBlocks, Label, LeafMeter, Panel, ScanFrame, Top3, TruthLine, VerdictStamp, toneBlock, useImageUrl } from '../components/ui'

type Filter = 'all' | Tone

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'disease', label: 'Disease' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'uncertain', label: 'Unsure' },
  { id: 'none', label: 'No leaf' },
]

export function FieldLog({ model, source }: { model: RoverModel; source: DataSource }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Capture | null>(null)
  const [more, setMore] = useState(true)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: model.captures.length, disease: 0, healthy: 0, uncertain: 0, none: 0 }
    for (const cap of model.captures) c[verdictView(cap).tone]++
    return c
  }, [model.captures])
  const shown = filter === 'all' ? model.captures : model.captures.filter((c) => verdictView(c).tone === filter)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label icon={BookOpen}>Specimen notebook</Label>
          <h1 className="display mt-1 text-5xl font-bold leading-none">Field log</h1>
        </div>
        <p className="text-[15px] text-bark">
          {counts.all} specimens · <span className="font-semibold text-terracotta">{counts.disease} diseased</span> ·{' '}
          <span className="font-semibold text-moss">{counts.healthy} healthy</span>
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter specimens">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-11 cursor-pointer rounded-full px-4 text-[14px] font-semibold transition-colors duration-150 ${
              filter === f.id ? 'bg-soil text-cream' : 'bg-card text-bark ring-1 ring-line hover:text-soil'
            }`}
          >
            {f.label} <span className="ml-0.5 tabular-nums opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Panel>
          <p className="display text-xl italic text-bark">No specimens here yet.</p>
        </Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((c, i) => (
            <li key={c.id}>
              <Tile capture={c} source={source} tilt={i % 3 === 0 ? '-rotate-[0.6deg]' : i % 3 === 1 ? 'rotate-[0.5deg]' : ''} onOpen={() => setOpen(c)} />
            </li>
          ))}
        </ul>
      )}

      {more && model.captures.length >= 24 && (
        <button
          type="button"
          onClick={async () => setMore(await model.appendOlder())}
          className="clay h-12 w-full cursor-pointer rounded-xl bg-inset font-semibold text-soil [--lip:var(--color-line)]"
        >
          Load older specimens
        </button>
      )}

      {open && (
        <Detail
          capture={open}
          source={source}
          onClose={() => setOpen(null)}
          onDelete={async () => {
            await model.removeCapture(open)
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}

function Tile({ capture, source, tilt, onOpen }: { capture: Capture; source: DataSource; tilt: string; onOpen: () => void }) {
  const src = useImageUrl(source, capture.imagePath)
  const view = verdictView(capture)
  const name = view.tone === 'none' ? 'No leaf' : view.tone === 'uncertain' ? 'Unsure' : view.headline
  return (
    <button type="button" onClick={onOpen} className={`paper group block w-full cursor-pointer p-2 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-0 ${tilt}`}>
      <div className="aspect-square overflow-hidden rounded-[0.8rem] bg-inset">
        {src && <img src={src} alt={view.headline} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />}
      </div>
      <div className="mt-2 px-1">
        <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-bold ${toneBlock[view.tone]}`}>{name}</span>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-bark">
          <span className="truncate">{capture.plantTag ?? '—'}</span>
          <span>{clockTime(capture.createdAt).slice(0, 5)}</span>
        </div>
      </div>
    </button>
  )
}

function Detail({ capture, source, onClose, onDelete }: { capture: Capture; source: DataSource; onClose: () => void; onDelete: () => void }) {
  const src = useImageUrl(source, capture.imagePath)
  const view = verdictView(capture)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-soil/70 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Specimen detail" onClick={onClose}>
      <div className="mx-auto max-w-xl space-y-4 rounded-[1.5rem] bg-paper p-4 pb-6 shadow-[0_6px_0_rgb(51_36_26/0.3)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <Label>
            {new Date(capture.createdAt).toLocaleString()} {capture.plantTag ? `· ${capture.plantTag}` : ''}
          </Label>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 cursor-pointer place-items-center rounded-full bg-card ring-1 ring-line hover:ring-bark">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ScanFrame src={src} alt={view.headline} scanning={false}>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <VerdictStamp view={view} id={capture.id} createdAt={capture.createdAt} />
          </div>
        </ScanFrame>
        <Panel className="space-y-5">
          <p className="text-bark">{view.detail}</p>
          {capture.verdict !== 'no_leaf' && <ConfidenceBlocks value={capture.confidence} tone={view.tone} />}
          <LeafMeter value={capture.leafFraction} />
          {capture.verdict !== 'no_leaf' && <Top3 items={capture.top3} />}
          {capture.truth && <TruthLine truth={capture.truth} predicted={capture.label} />}
          {view.showRemedy && (
            <div className={`rounded-xl p-4 ${capture.label === 'healthy' ? 'bg-sprout/20' : 'bg-terracotta/10'}`}>
              <Label className={capture.label === 'healthy' ? 'text-moss' : 'text-terracotta'}>
                {capture.label === 'healthy' ? 'Care' : `Treatment · ${LABEL_NAME[capture.label]}`}
              </Label>
              <p className="mt-1.5 leading-relaxed">{REMEDY[capture.label]}</p>
              {capture.label !== 'healthy' && <p className="mt-2 text-[13px] italic text-bark">{REMEDY_FOOTER}</p>}
            </div>
          )}
          {capture.source && <p className="font-mono text-[11px] uppercase tracking-wider text-bark">Source: {capture.source}</p>}
        </Panel>
        <button
          type="button"
          onClick={() => (armed ? onDelete() : setArmed(true))}
          className={`flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-colors ${
            armed ? 'bg-terracotta text-cream' : 'bg-card text-bark ring-1 ring-line hover:text-terracotta hover:ring-terracotta'
          }`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {armed ? 'Tap again to delete for good' : 'Delete specimen'}
        </button>
      </div>
    </div>
  )
}

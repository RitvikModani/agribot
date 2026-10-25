import { useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { Capture, DataSource } from '../data/types'
import type { RoverModel } from '../hooks/useRover'
import { LABEL_NAME, REMEDY, REMEDY_FOOTER } from '../lib/labels'
import { clockTime, verdictView, type Tone } from '../lib/status'
import { ConfidenceBlocks, Label, LeafMeter, Panel, ScanFrame, Top3, TruthLine, VerdictStamp, toneFill, useImageUrl } from '../components/ui'

type Filter = 'all' | Tone

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'disease', label: 'Disease' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'uncertain', label: 'Uncertain' },
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
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="condensed font-display text-6xl font-black uppercase leading-none">Field log</h1>
        <p className="font-mono text-sm text-stalk">
          {counts.all} captures · <span className="text-rust">{counts.disease} disease</span> ·{' '}
          <span className="text-chlorophyll">{counts.healthy} healthy</span>
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter captures">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-11 cursor-pointer border-2 px-3 font-mono text-[12px] font-bold uppercase tracking-widest transition-colors duration-150 ${
              filter === f.id ? 'border-bone bg-bone text-soil' : 'border-furrow text-stalk hover:text-bone'
            }`}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Panel>
          <p className="text-stalk">Nothing here yet.</p>
        </Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((c) => (
            <li key={c.id}>
              <Tile capture={c} source={source} onOpen={() => setOpen(c)} />
            </li>
          ))}
        </ul>
      )}

      {more && model.captures.length >= 24 && (
        <button
          type="button"
          onClick={async () => setMore(await model.appendOlder())}
          className="h-12 w-full cursor-pointer border-2 border-furrow font-mono text-sm font-bold uppercase tracking-widest text-stalk hover:text-bone"
        >
          Load older
        </button>
      )}

      {open && <Detail capture={open} source={source} onClose={() => setOpen(null)} onDelete={async () => { await model.removeCapture(open); setOpen(null) }} />}
    </div>
  )
}

function Tile({ capture, source, onOpen }: { capture: Capture; source: DataSource; onOpen: () => void }) {
  const src = useImageUrl(source, capture.imagePath)
  const view = verdictView(capture)
  return (
    <button type="button" onClick={onOpen} className="group block w-full cursor-pointer text-left">
      <div className="aspect-square overflow-hidden border-2 border-furrow bg-bed group-hover:border-bone">
        {src && <img src={src} alt={view.headline} loading="lazy" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />}
      </div>
      <div className={`flex items-center justify-between px-2 py-1 ${toneFill[view.tone]} text-soil`}>
        <span className="condensed truncate font-display text-lg font-black uppercase leading-tight">{view.tone === 'none' ? 'No leaf' : view.tone === 'uncertain' ? 'Uncertain' : view.headline}</span>
        <span className="font-mono text-[11px] font-semibold">{clockTime(capture.createdAt).slice(0, 5)}</span>
      </div>
      {capture.plantTag && <span className="mt-0.5 block truncate font-mono text-[11px] uppercase text-stalk">{capture.plantTag}</span>}
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
    <div className="fixed inset-0 z-30 overflow-y-auto bg-soil/95 p-4" role="dialog" aria-modal="true" aria-label="Capture detail">
      <div className="mx-auto max-w-xl space-y-4 pb-24">
        <div className="flex items-center justify-between">
          <Label>
            {new Date(capture.createdAt).toLocaleString()} {capture.plantTag ? `· ${capture.plantTag}` : ''}
          </Label>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 cursor-pointer place-items-center border-2 border-furrow hover:border-bone">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ScanFrame src={src} alt={view.headline} scanning={false}>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <VerdictStamp view={view} id={capture.id} />
          </div>
        </ScanFrame>
        <Panel className="space-y-4">
          <p className="text-stalk">{view.detail}</p>
          {capture.verdict !== 'no_leaf' && <ConfidenceBlocks value={capture.confidence} tone={view.tone} />}
          <LeafMeter value={capture.leafFraction} />
          {capture.verdict !== 'no_leaf' && <Top3 items={capture.top3} />}
          {capture.truth && <TruthLine truth={capture.truth} predicted={capture.label} />}
          {view.showRemedy && (
            <div>
              <Label>{capture.label === 'healthy' ? 'Care' : `Treatment · ${LABEL_NAME[capture.label]}`}</Label>
              <p className="mt-1 leading-relaxed">{REMEDY[capture.label]}</p>
              {capture.label !== 'healthy' && <p className="mt-2 text-xs text-stalk">{REMEDY_FOOTER}</p>}
            </div>
          )}
          {capture.source && <p className="font-mono text-[11px] uppercase tracking-wider text-stalk">Source: {capture.source}</p>}
        </Panel>
        <button
          type="button"
          onClick={() => (armed ? onDelete() : setArmed(true))}
          className={`flex h-12 w-full cursor-pointer items-center justify-center gap-2 border-2 font-mono text-sm font-bold uppercase tracking-widest ${
            armed ? 'border-rust bg-rust text-soil' : 'border-furrow text-stalk hover:border-rust hover:text-rust'
          }`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {armed ? 'Tap again to delete for good' : 'Delete capture'}
        </button>
      </div>
    </div>
  )
}

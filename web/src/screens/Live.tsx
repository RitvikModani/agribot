import { useEffect, useState } from 'react'
import { Crosshair, Minus, Plus, RotateCcw } from 'lucide-react'
import type { Capture, DataSource } from '../data/types'
import { useNow, type RoverModel } from '../hooks/useRover'
import { REMEDY, REMEDY_FOOTER } from '../lib/labels'
import { captureRequestStatus, clockTime, isOnline, relativeTime, verdictView, type RequestStatus } from '../lib/status'
import {
  ConfidenceBlocks,
  Label,
  LeafMeter,
  Panel,
  ScanFrame,
  Top3,
  TruthLine,
  VerdictStamp,
  toneFill,
  toneText,
  useImageUrl,
} from '../components/ui'

const INTERVALS = [3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300]

export function Live({ model, source, onOpenRover }: { model: RoverModel; source: DataSource; onOpenRover: () => void }) {
  const now = useNow(1000)
  const { rover, captures } = model
  const latest = captures[0]
  const src = useImageUrl(source, latest?.imagePath)

  if (rover === undefined) return <Label className="block p-6">Connecting to rover…</Label>
  if (rover === null) {
    return (
      <Panel className="space-y-3">
        <p className="condensed font-display text-4xl font-black uppercase">No rover yet</p>
        <p className="text-stalk">Create the rover and get its device token, then flash the camera.</p>
        <button type="button" onClick={onOpenRover} className="h-12 cursor-pointer border-2 border-chlorophyll bg-chlorophyll px-5 font-mono text-sm font-bold uppercase tracking-widest text-soil">
          Set up rover
        </button>
      </Panel>
    )
  }

  const online = isOnline(rover.device.lastSeenAt, now)
  const request = captureRequestStatus(rover.state.captureRequestedAt, now)
  const view = latest ? verdictView(latest) : null
  const revoked = rover.device.revokedAt !== null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <ScanFrame src={src} scanning={request === 'pending'} alt={latest ? `Latest capture, ${view?.headline}` : 'No capture yet'}>
          <div className="absolute inset-x-0 top-0 flex justify-between p-3 font-mono text-[12px] uppercase tracking-widest">
            <span className="bg-soil/80 px-1.5 py-0.5 text-chlorophyll">CAM-01 · 640×480</span>
            {latest && <span className="bg-soil/80 px-1.5 py-0.5 text-bone">{clockTime(latest.createdAt)}</span>}
          </div>
          {request === 'pending' && (
            <div className="absolute inset-x-0 bottom-0 p-4">
              <span className="bg-soil px-2 py-1 font-mono text-sm font-bold uppercase tracking-widest text-chlorophyll">Acquiring frame…</span>
            </div>
          )}
          {view && latest && request !== 'pending' && (
            <div className="absolute inset-x-0 bottom-0 p-4">
              <VerdictStamp view={view} id={latest.id} />
            </div>
          )}
        </ScanFrame>
        <CaptureButton
          status={request}
          online={online}
          revoked={revoked}
          elapsedS={rover.state.captureRequestedAt ? Math.floor((now - Date.parse(rover.state.captureRequestedAt)) / 1000) : 0}
          onPress={() => void model.requestCapture()}
        />
        {!online && (
          <p className="font-mono text-xs uppercase tracking-wider text-stalk">
            Rover last seen {relativeTime(rover.device.lastSeenAt, now)} · check the hotspot and the camera's power
          </p>
        )}
      </div>

      <div className="space-y-4">
        <Diagnosis capture={latest} />
        <PatrolPanel model={model} />
        <Recent captures={captures.slice(1, 9)} source={source} />
      </div>
    </div>
  )
}

function CaptureButton({
  status,
  online,
  revoked,
  elapsedS,
  onPress,
}: {
  status: RequestStatus
  online: boolean
  revoked: boolean
  elapsedS: number
  onPress: () => void
}) {
  const blocked = !online || revoked
  const label = revoked ? 'Token revoked' : !online ? 'Rover offline' : status === 'pending' ? `Capturing · ${elapsedS}s` : status === 'stalled' ? 'Not received · retry' : 'Capture'
  const look = blocked
    ? 'cursor-not-allowed border-furrow bg-bed text-stalk'
    : status === 'pending'
      ? 'cursor-wait border-chlorophyll bg-bed text-chlorophyll'
      : status === 'stalled'
        ? 'cursor-pointer border-pollen bg-pollen text-soil'
        : 'cursor-pointer border-chlorophyll bg-chlorophyll text-soil hover:bg-bone hover:border-bone'
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={blocked || status === 'pending'}
      className={`condensed relative flex h-[4.5rem] w-full items-center justify-center gap-3 overflow-hidden border-2 font-display text-4xl font-black uppercase tracking-wide transition-[background-color,transform] duration-150 active:translate-y-[2px] ${look}`}
    >
      {status === 'stalled' ? <RotateCcw className="size-7" aria-hidden="true" /> : <Crosshair className="size-7" aria-hidden="true" />}
      {label}
      {status === 'pending' && (
        <span className="absolute bottom-0 left-0 h-1.5 bg-chlorophyll transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (elapsedS / 15) * 100)}%` }} />
      )}
    </button>
  )
}

function Diagnosis({ capture }: { capture: Capture | undefined }) {
  if (!capture) {
    return (
      <Panel>
        <Label>Diagnosis</Label>
        <p className="mt-2 text-stalk">Waiting for the first capture. Press Capture, or switch on Patrol.</p>
      </Panel>
    )
  }
  const view = verdictView(capture)
  return (
    <Panel className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <Label>Diagnosis</Label>
          <span className="font-mono text-xs text-stalk">{capture.modelVersion}</span>
        </div>
        <p className={`condensed mt-1 font-display text-5xl font-black uppercase leading-none ${toneText[view.tone]}`}>{view.headline}</p>
        <p className="mt-1.5 text-stalk">{view.detail}</p>
      </div>
      {capture.verdict !== 'no_leaf' && <ConfidenceBlocks value={capture.confidence} tone={view.tone} />}
      <LeafMeter value={capture.leafFraction} />
      {capture.verdict !== 'no_leaf' && (
        <div>
          <Label>Top 3</Label>
          <div className="mt-2">
            <Top3 items={capture.top3} />
          </div>
        </div>
      )}
      {capture.truth && <TruthLine truth={capture.truth} predicted={capture.label} />}
      {view.showRemedy && (
        <div className={`border-l-4 pl-3 ${view.tone === 'healthy' ? 'border-chlorophyll' : 'border-rust'}`}>
          <Label>{view.tone === 'healthy' ? 'Care' : 'Treatment'}</Label>
          <p className="mt-1 leading-relaxed">{REMEDY[capture.label]}</p>
          {view.tone === 'disease' && <p className="mt-2 text-xs text-stalk">{REMEDY_FOOTER}</p>}
        </div>
      )}
    </Panel>
  )
}

function PatrolPanel({ model }: { model: RoverModel }) {
  const state = model.rover!.state
  const [tag, setTag] = useState(state.plantTag ?? '')
  useEffect(() => setTag(state.plantTag ?? ''), [state.plantTag])
  const idx = Math.max(0, INTERVALS.findIndex((v) => v >= state.patrolIntervalS))
  const step = (d: number) => {
    const next = INTERVALS[Math.min(INTERVALS.length - 1, Math.max(0, idx + d))]
    if (next !== state.patrolIntervalS) void model.updateControls({ patrolIntervalS: next })
  }
  const saveTag = () => {
    const value = tag.trim().slice(0, 40) || null
    if (value !== state.plantTag) void model.updateControls({ plantTag: value })
  }

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Patrol</Label>
          <p className="mt-1 text-sm text-stalk">Auto-capture while you drive the rows.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.patrolOn}
          aria-label="Patrol"
          onClick={() => void model.updateControls({ patrolOn: !state.patrolOn })}
          className={`relative h-9 w-16 shrink-0 cursor-pointer border-2 transition-colors duration-150 ${state.patrolOn ? 'border-chlorophyll bg-chlorophyll' : 'border-furrow bg-soil'}`}
        >
          <span className={`absolute top-1 size-5 transition-[left] duration-150 ${state.patrolOn ? 'left-8 bg-soil' : 'left-1 bg-stalk'}`} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => step(-1)} aria-label="Shorter interval" className="grid size-11 cursor-pointer place-items-center border-2 border-furrow hover:border-bone">
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <div className="flex-1 text-center">
          <span className="font-mono text-3xl font-semibold tabular-nums">{state.patrolIntervalS}</span>
          <span className="ml-1 font-mono text-sm text-stalk">s / frame</span>
        </div>
        <button type="button" onClick={() => step(1)} aria-label="Longer interval" className="grid size-11 cursor-pointer place-items-center border-2 border-furrow hover:border-bone">
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      <label className="block">
        <Label>Plant tag</Label>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onBlur={saveTag}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          maxLength={40}
          placeholder="row-4 / plant-12"
          className="mt-1.5 h-11 w-full border-2 border-furrow bg-soil px-3 font-mono text-base text-bone placeholder:text-stalk/60 focus:border-chlorophyll focus:outline-none"
        />
        <span className="mt-1 block text-xs text-stalk">Stamped onto every capture until you change it.</span>
      </label>
    </Panel>
  )
}

function Recent({ captures, source }: { captures: Capture[]; source: DataSource }) {
  if (!captures.length) return null
  return (
    <div>
      <Label>Earlier</Label>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {captures.map((c) => (
          <RecentThumb key={c.id} capture={c} source={source} />
        ))}
      </div>
    </div>
  )
}

function RecentThumb({ capture, source }: { capture: Capture; source: DataSource }) {
  const src = useImageUrl(source, capture.imagePath)
  const view = verdictView(capture)
  return (
    <figure className="w-20 shrink-0">
      <div className="aspect-square border-2 border-furrow bg-bed">{src && <img src={src} alt={view.headline} loading="lazy" className="size-full object-cover" />}</div>
      <div className={`h-1.5 ${toneFill[view.tone]}`} />
      <figcaption className="mt-1 truncate font-mono text-[11px] uppercase text-stalk">{view.tone === 'none' ? 'no leaf' : view.headline}</figcaption>
    </figure>
  )
}

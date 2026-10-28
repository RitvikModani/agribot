import { useEffect, useState } from 'react'
import { Cpu, Leaf, Minus, Plus, RotateCcw, ScanLine, Sprout, Stethoscope, Tag, Timer } from 'lucide-react'
import type { Capture, DataSource } from '../data/types'
import { useNow, type RoverModel } from '../hooks/useRover'
import type { RegionModel } from '../hooks/useRegion'
import type { Forecast } from '../lib/weather'
import { DiseasePressure, RegionPrompt, SprayWindow, WeatherCard } from '../components/weather'
import { WhereToBuy } from '../components/shops'
import { CaptureSteps, WaveBand } from '../components/verdeo'
import { AiFindings, AiNote, BoxOverlay } from '../components/aiView'
import { diagnosisOf, headline, isTomato } from '../lib/diagnosis'
import type { Region } from '../lib/weather'
import { REMEDY, REMEDY_FOOTER } from '../lib/labels'
import { captureSteps } from '../lib/steps'
import { captureRequestStatus, isOnline, relativeTime, verdictView, type RequestStatus } from '../lib/status'
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

export function Live({
  model,
  source,
  region,
  onOpenRover,
}: {
  model: RoverModel
  source: DataSource
  region: RegionModel
  onOpenRover: () => void
}) {
  const now = useNow(1000)
  const { rover, captures } = model
  const latest = captures[0]
  const src = useImageUrl(source, latest?.imagePath)

  if (rover === undefined) return <p className="display p-2 text-xl italic text-bark">Finding the rover…</p>
  if (rover === null) {
    return (
      <Panel className="space-y-3">
        <Sprout className="size-10 text-moss" aria-hidden="true" />
        <h1 className="display text-4xl font-semibold">
          Plant your first <span className="accent">rover</span>
        </h1>
        <p className="text-bark">Register the camera to get its device token, then flash it.</p>
        <button type="button" onClick={onOpenRover} className="clay h-12 cursor-pointer rounded-full bg-moss px-6 font-semibold text-cream">
          Set up rover
        </button>
      </Panel>
    )
  }

  const online = isOnline(rover.device.lastSeenAt, now)
  const request = captureRequestStatus(rover.state.captureRequestedAt, now)
  // The stamp shows Gemini's whole-plant headline once it's in, the tomato model's until then.
  const lead = latest ? headline(latest) : null
  const view = latest && lead ? { ...verdictView(latest), tone: lead.tone, headline: lead.text } : null
  const revoked = rover.device.revokedAt !== null
  const hour = new Date(now).getHours()
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div className="space-y-5">
      <h1 className="display text-[2.4rem] font-semibold leading-[1.05] text-loam">
        Good {partOfDay},<br />
        <span className="accent">{region.region?.placeName ?? 'grower'}.</span>
      </h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ScanFrame src={src} scanning={request === 'pending'} alt={latest ? `Latest capture, ${view?.headline}` : 'No capture yet'}>
            <div className="absolute inset-x-0 top-0 flex justify-between p-3">
              <span className="rounded-full bg-card/90 px-2.5 py-1 font-mono text-[11px] text-moss">Cam 01 · 640×480</span>
              {latest?.plantTag && <span className="rounded-full bg-card/90 px-2.5 py-1 text-[12px] font-semibold text-soil">{latest.plantTag}</span>}
            </div>
            {request === 'pending' && (
              <div className="absolute inset-x-0 bottom-0 p-4">
                <span className="accent rounded-full bg-card/90 px-3.5 py-1.5 text-lg text-moss">Looking closely…</span>
              </div>
            )}
            {latest && request !== 'pending' && <BoxOverlay capture={latest} />}
            {view && latest && request !== 'pending' && (
              <div className="absolute inset-x-0 bottom-0 p-4">
                <VerdictStamp view={view} id={latest.id} createdAt={latest.createdAt} />
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
            <p className="text-sm text-bark">
              Rover last seen {relativeTime(rover.device.lastSeenAt, now)}. Check the hotspot and the camera's power.
            </p>
          )}
        </div>
  
        <div className="space-y-5">
          {region.region === null && <RegionPrompt onPick={region.save} error={region.error} />}
          <Diagnosis capture={latest} request={request} forecast={region.forecast} region={region.region} source={source} />
          {region.region && <WeatherCard region={region.region} forecast={region.forecast} error={region.error} />}
          {region.region && region.forecast && (
            <WaveBand>
              <DiseasePressure forecast={region.forecast} />
            </WaveBand>
          )}
          <PatrolPanel model={model} />
          <Recent captures={captures.slice(1, 9)} source={source} />
        </div>
      </div>
    </div>
  )
}

/** Scroll a section into view, without animation when the user asked for reduced motion. */
function jumpTo(id: string) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
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
  const label = revoked ? 'Token revoked' : !online ? 'Rover offline' : status === 'pending' ? `Capturing · ${elapsedS}s` : status === 'stalled' ? 'Not received · retry' : 'Capture leaf'
  const look = blocked
    ? 'cursor-not-allowed bg-inset text-bark [--lip:var(--color-line)]'
    : status === 'pending'
      ? 'cursor-wait bg-moss-deep text-cream [--lip:#2c341d]'
      : status === 'stalled'
        ? 'cursor-pointer bg-ochre text-soil [--lip:var(--color-ochre-deep)]'
        : 'cursor-pointer bg-moss text-cream hover:bg-[#56623a]'
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={blocked || status === 'pending'}
      className={`clay relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-full ${look}`}
    >
      {status === 'stalled' ? <RotateCcw className="size-6" aria-hidden="true" /> : <ScanLine className="size-6" aria-hidden="true" />}
      <span className="display text-[1.6rem] font-semibold">{label}</span>
      {status === 'pending' && (
        <span className="absolute bottom-0 left-0 h-1.5 bg-sprout transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (elapsedS / 15) * 100)}%` }} />
      )}
    </button>
  )
}

function Diagnosis({
  capture,
  request,
  forecast,
  region,
  source,
}: {
  capture: Capture | undefined
  request: RequestStatus
  forecast: Forecast | null
  region: Region | null | undefined
  source: DataSource
}) {
  const lead = capture ? headline(capture) : null
  const ai = lead?.source === 'ai'
  // With a whole-plant diagnosis, its findings list is both the treatment and the place to buy.
  const steps = <CaptureSteps steps={captureSteps(request, capture)} onStep={(s) => jumpTo(ai || s === 'Treat' ? 'treatment' : 'where-to-buy')} />
  if (!capture || !lead) {
    return (
      <Panel className="space-y-4">
        <div>
          <Label icon={Stethoscope}>Diagnosis</Label>
          <p className="accent mt-2 text-xl text-bark">Waiting for the first leaf. Press Capture, or start a patrol.</p>
        </div>
        {steps}
      </Panel>
    )
  }
  const view = verdictView(capture)
  const showModel = !ai || isTomato(capture) // the tomato model only has an opinion on tomatoes
  return (
    <Panel className="relative space-y-5 overflow-hidden">
      <Leaf className="pointer-events-none absolute -right-6 -top-6 size-36 rotate-12 text-moss/[0.06]" aria-hidden="true" />
      <div>
        <div className="flex items-baseline justify-between">
          <Label icon={Stethoscope}>Diagnosis</Label>
          <span className="font-mono text-[11px] text-bark">{ai ? capture.aiModel : capture.modelVersion}</span>
        </div>
        <h2 className={`display mt-1 text-5xl font-semibold leading-[1.02] ${toneText[lead.tone]}`}>{lead.text}</h2>
        <p className="mt-1.5 text-bark">{ai ? diagnosisOf(capture)?.summary : view.detail}</p>
        <AiNote capture={capture} />
      </div>
      {steps}
      <AiFindings capture={capture} place={region?.placeName ?? null} />
      {ai && lead.tone === 'disease' && <SprayWindow forecast={forecast} />}
      {showModel && (
        <div className={ai ? 'space-y-5 rounded-2xl bg-inset/60 p-4' : 'space-y-5'}>
          {ai && (
            <Label icon={Cpu}>
              Second opinion (tomato model) · {view.headline}
            </Label>
          )}
          {capture.verdict !== 'no_leaf' && <ConfidenceBlocks value={capture.confidence} />}
          <LeafMeter value={capture.leafFraction} />
          {capture.verdict !== 'no_leaf' && (
            <div>
              <Label>Top three</Label>
              <div className="mt-2">
                <Top3 items={capture.top3} />
              </div>
            </div>
          )}
          {capture.truth && <TruthLine truth={capture.truth} predicted={capture.label} />}
          {capture.verdict !== 'no_leaf' && (
            <a href="#/grow/tomato" className="flex items-center gap-1.5 text-[14px] font-semibold text-moss underline-offset-4 hover:underline">
              <Sprout className="size-4" aria-hidden="true" /> How to grow tomato{region ? ` in ${region.placeName}` : ''}
            </a>
          )}
          {view.showRemedy && (
            <div id={ai ? undefined : 'treatment'} className={`scroll-mt-4 rounded-2xl p-4 ${view.tone === 'healthy' ? 'bg-sprout/20' : 'bg-terracotta/10'}`}>
              <Label className={view.tone === 'healthy' ? 'text-moss' : 'text-terracotta-ink'}>{view.tone === 'healthy' ? 'Care' : 'Treatment'}</Label>
              <p className="mt-1.5 leading-relaxed">{REMEDY[capture.label]}</p>
              {view.tone === 'disease' && (
                <>
                  {!ai && (
                    <div className="mt-3">
                      <SprayWindow forecast={forecast} />
                    </div>
                  )}
                  <div id={ai ? undefined : 'where-to-buy'} className="scroll-mt-4">
                    <WhereToBuy key={capture.id} label={capture.label} region={region} source={source} />
                  </div>
                  <p className="mt-2 text-[13px] italic text-bark">{REMEDY_FOOTER}</p>
                </>
              )}
            </div>
          )}
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
    <Panel className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label icon={Timer}>Patrol</Label>
          <p className="mt-1 text-[15px] text-bark">Capture automatically while you drive down the row.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.patrolOn}
          aria-label="Patrol"
          onClick={() => void model.updateControls({ patrolOn: !state.patrolOn })}
          className={`relative h-9 w-16 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${state.patrolOn ? 'bg-moss' : 'bg-inset ring-1 ring-inset ring-line'}`}
        >
          <span className={`absolute top-1 size-7 rounded-full shadow-[0_2px_0_rgb(51_36_26/0.25)] transition-[left] duration-150 ${state.patrolOn ? 'left-8 bg-cream' : 'left-1 bg-bark/60'}`} />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => step(-1)} aria-label="Shorter interval" className="clay grid size-11 cursor-pointer place-items-center rounded-full bg-inset text-soil [--lip:var(--color-line)]">
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <div className="flex-1 text-center">
          <span className="display text-4xl font-semibold tabular-nums">{state.patrolIntervalS}</span>
          <span className="ml-1.5 text-sm text-bark">seconds per leaf</span>
        </div>
        <button type="button" onClick={() => step(1)} aria-label="Longer interval" className="clay grid size-11 cursor-pointer place-items-center rounded-full bg-inset text-soil [--lip:var(--color-line)]">
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      <label className="block">
        <Label icon={Tag}>Bed or plant tag</Label>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onBlur={saveTag}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          maxLength={40}
          placeholder="row-4 / plant-12"
          className="mt-2 h-12 w-full rounded-full border-[1.5px] border-line bg-paper px-5 text-base text-soil placeholder:text-bark/60 focus:border-moss focus:outline-none"
        />
        <span className="mt-1.5 block text-[13px] text-bark">Written onto every capture until you change it.</span>
      </label>
    </Panel>
  )
}

function Recent({ captures, source }: { captures: Capture[]; source: DataSource }) {
  if (!captures.length) return null
  return (
    <div>
      <Label icon={Leaf}>Earlier specimens</Label>
      <div className="mt-2.5 flex gap-3 overflow-x-auto pb-2">
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
    <figure className="organic w-24 shrink-0 bg-card p-1.5 ring-1 ring-line">
      <div className="aspect-square overflow-hidden rounded-[20px_12px_24px_10px] bg-inset">{src && <img src={src} alt={view.headline} loading="lazy" className="size-full object-cover" />}</div>
      <figcaption className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <span className={`size-2 shrink-0 rounded-full ${toneFill[view.tone]}`} aria-hidden="true" />
        <span className="truncate text-[12px] font-semibold">{view.tone === 'none' ? 'No leaf' : view.tone === 'uncertain' ? 'Unsure' : view.headline}</span>
      </figcaption>
    </figure>
  )
}

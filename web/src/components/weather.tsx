import { useEffect, useState } from 'react'
import { CloudRain, CloudSun, Droplets, LocateFixed, MapPin, Search, SprayCan, Sun, Thermometer, TriangleAlert, Wind } from 'lucide-react'
import { currentPosition, regionFromCoords, searchPlaces } from '../lib/geo'
import { LABEL_NAME } from '../lib/labels'
import { diseaseRisks, sprayWindow, type SprayKind } from '../lib/risk'
import { describeCode, type Forecast, type MonthNormal, type Region } from '../lib/weather'
import { Label, Panel } from './ui'

const regionLine = (r: Region) => [r.placeName, r.admin1, r.country].filter(Boolean).join(', ')
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayName = (date: string, today?: string) => (date === today ? 'Today' : new Date(`${date}T12:00`).toLocaleDateString([], { weekday: 'short' }))
const whenLabel = (localIso: string, today: string) => {
  const hour = new Date(localIso).toLocaleTimeString([], { hour: 'numeric' })
  return `${localIso.slice(0, 10) === today ? 'today' : dayName(localIso.slice(0, 10))} ${hour}`
}

export function RegionPicker({ onPick }: { onPick: (r: Region) => void | Promise<void> }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Region[]>([])
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    let live = true
    const t = setTimeout(() => {
      searchPlaces(query).then(
        (r) => {
          if (!live) return
          setResults(r)
          setStatus(r.length ? null : 'No places found. Try the nearest town.')
        },
        () => live && setStatus('Place search is unavailable right now.'),
      )
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query])

  async function useGps() {
    setStatus('Finding you…')
    try {
      const { lat, lon } = await currentPosition()
      await onPick(await regionFromCoords(lat, lon))
      setStatus(null)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not get your location.')
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Search for your town or village</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-bark" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hanamkonda, Warangal, Nashik…"
            className="h-12 w-full rounded-xl border-[1.5px] border-line bg-paper pl-11 pr-4 text-base focus:border-moss focus:outline-none"
          />
        </span>
      </label>
      {results.length > 0 && (
        <ul className="overflow-hidden rounded-xl ring-1 ring-line" role="listbox" aria-label="Places">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onClick={() => void onPick(r)}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-line/60 bg-card px-4 py-3 text-left last:border-b-0 hover:bg-inset"
              >
                <MapPin className="size-4 shrink-0 text-moss" aria-hidden="true" />
                <span>
                  <span className="font-semibold">{r.placeName}</span>
                  <span className="block text-[13px] text-bark">{[r.admin1, r.country].filter(Boolean).join(', ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={useGps} className="clay flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-inset font-semibold text-soil [--lip:var(--color-line)]">
        <LocateFixed className="size-5" aria-hidden="true" /> Use my location
      </button>
      {status && (
        <p className="text-sm text-bark" role="status">
          {status}
        </p>
      )}
    </div>
  )
}

export function RegionPrompt({ onPick, error }: { onPick: (r: Region) => Promise<void>; error: string | null }) {
  return (
    <Panel className="space-y-3">
      <Label icon={MapPin}>Your region</Label>
      <h2 className="display text-3xl font-bold leading-tight">Where's your field?</h2>
      <p className="text-bark">AgriBot uses your local weather to warn you which diseases are coming and when it's safe to spray.</p>
      <RegionPicker onPick={onPick} />
      {error && <p className="text-sm font-semibold text-terracotta">{error}</p>}
    </Panel>
  )
}

export function WeatherCard({ region, forecast, error }: { region: Region; forecast: Forecast | null; error: string | null }) {
  if (!forecast) {
    return (
      <Panel>
        <Label icon={MapPin}>{regionLine(region)}</Label>
        <p className="display mt-2 text-xl italic text-bark">{error ?? 'Reading the sky…'}</p>
      </Panel>
    )
  }
  const risks = diseaseRisks(forecast.hours)
  const { now } = forecast
  return (
    <Panel className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label icon={MapPin} className="max-w-full truncate">
            {regionLine(region)}
          </Label>
          <div className="mt-1 flex items-end gap-3">
            <span className="display text-5xl font-bold leading-none tabular-nums">{Math.round(now.temp)}°</span>
            <span className="pb-1 text-bark">
              {describeCode(now.code)}
              <span className="block text-[12px]">as of {timeOf(forecast.fetchedAt)}</span>
            </span>
          </div>
        </div>
        <CloudSun className="size-12 shrink-0 text-ochre" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={Droplets} label="Humidity" value={`${Math.round(now.rh)}%`} />
        <Stat icon={Wind} label="Wind" value={`${Math.round(now.wind)} km/h`} />
        <Stat icon={CloudRain} label="Rain now" value={`${now.rain.toFixed(1)} mm`} />
      </div>
      <ol className="grid grid-cols-4 gap-1.5">
        {forecast.days.map((d) => (
          <li key={d.date} className="rounded-xl bg-inset px-1 py-2 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-bark">{dayName(d.date, now.time.slice(0, 10))}</div>
            <div className="display text-lg font-bold tabular-nums">
              {Math.round(d.max)}° <span className="text-bark">{Math.round(d.min)}°</span>
            </div>
            <div className="text-[12px] text-bark">{d.rain > 0.2 ? `${d.rain.toFixed(1)} mm rain` : describeCode(d.code)}</div>
          </li>
        ))}
      </ol>
      <div>
        <Label icon={TriangleAlert}>Disease pressure · next 3 days</Label>
        {risks.length === 0 ? (
          <p className="mt-2 text-[15px] text-moss">Low disease pressure for the next 3 days.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {risks.map((r) => (
              <li key={r.label} className="flex items-start gap-3 rounded-xl bg-inset px-3 py-2.5">
                <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${r.level === 'high' ? 'bg-terracotta text-cream' : 'bg-ochre text-soil'}`}>
                  {r.level}
                </span>
                <span>
                  <span className="font-semibold">{LABEL_NAME[r.label]}</span>
                  <span className="block text-[13px] text-bark">
                    {r.reason}, from {whenLabel(r.startsAt, now.time.slice(0, 10))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] italic text-bark">A guide from simplified tomato-disease weather rules, not a forecast model.</p>
      </div>
    </Panel>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Wind; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-inset px-2 py-2">
      <Icon className="mx-auto size-4 text-bark" aria-hidden="true" />
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-bark">{label}</div>
    </div>
  )
}

const SPRAY_ICON: Record<SprayKind, typeof Wind> = { rain: CloudRain, wind: Wind, heat: Thermometer, good: Sun }

export function SprayWindow({ forecast }: { forecast: Forecast | null }) {
  if (!forecast) return null
  const advice = sprayWindow(forecast.hours)
  const Icon = SPRAY_ICON[advice.kind]
  const good = advice.kind === 'good'
  return (
    <div className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${good ? 'bg-sprout/20' : 'bg-ochre/20'}`}>
      <SprayCan className={`mt-0.5 size-5 shrink-0 ${good ? 'text-moss' : 'text-ochre-deep'}`} aria-hidden="true" />
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-bark">
          Spray window <Icon className="size-3.5" aria-hidden="true" />
        </div>
        <p className="text-[15px]">{advice.message}</p>
      </div>
    </div>
  )
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function ClimateBars({ normals }: { normals: MonthNormal[] | null }) {
  if (!normals) return <p className="text-sm italic text-bark">Loading ten years of climate…</p>
  const maxRain = Math.max(1, ...normals.map((n) => n.rain))
  const thisMonth = new Date().getMonth()
  return (
    <figure>
      <div className="flex h-28 items-end gap-1" role="img" aria-label="Average monthly rainfall and temperature over the last ten years">
        {normals.map((n, i) => (
          <div key={n.month} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-bark">{n.rain}</span>
            <div className={`w-full rounded-t-md ${i === thisMonth ? 'bg-moss' : 'bg-sprout/60'}`} style={{ height: `${Math.max(3, (n.rain / maxRain) * 80)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {normals.map((n, i) => (
          <div key={n.month} className={`flex-1 text-center text-[11px] ${i === thisMonth ? 'font-bold text-soil' : 'text-bark'}`}>
            {MONTHS[i]}
            <span className="block tabular-nums">{n.temp == null ? '–' : `${Math.round(n.temp)}°`}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-[12px] text-bark">Average rain (mm) and temperature per month, last 10 years.</figcaption>
    </figure>
  )
}

export { regionLine }

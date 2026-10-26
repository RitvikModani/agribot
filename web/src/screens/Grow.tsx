import { useEffect, useState, type FormEvent } from 'react'
import { Search, Sprout } from 'lucide-react'
import type { DataSource } from '../data/types'
import type { RegionModel } from '../hooks/useRegion'
import { isPlantName, QUICK_PICKS, type GuideResult } from '../lib/guide'
import { GuideCard } from '../components/guide'
import { Label, Panel } from '../components/ui'
import { Sprig } from '../components/verdeo'

type State = { kind: 'idle' } | { kind: 'loading'; plant: string } | { kind: 'done'; result: GuideResult } | { kind: 'unavailable' } | { kind: 'error'; message: string }

export function Grow({ source, region, initialPlant }: { source: DataSource; region: RegionModel; initialPlant: string | null }) {
  const [query, setQuery] = useState(initialPlant ?? '')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const r = region.region

  async function lookUp(plant: string) {
    if (!r) return
    if (!isPlantName(plant)) {
      setState({ kind: 'error', message: 'Use just the plant name: 2–40 letters, like "okra" or "bell pepper".' })
      return
    }
    setQuery(plant)
    setState({ kind: 'loading', plant })
    try {
      const result = await source.getGuide(plant.trim(), r)
      setState(result ? { kind: 'done', result } : { kind: 'unavailable' })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't get a guide." })
    }
  }

  useEffect(() => {
    if (initialPlant && r) void lookUp(initialPlant)
    // Only when arriving with a plant (e.g. from a diagnosis) or once the region loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlant, r?.lat, r?.lon])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void lookUp(query)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="relative pr-20">
        <Sprig className="absolute -top-2 right-0 h-28" />
        <Label icon={Sprout}>Grow guides</Label>
        <h1 className="display mt-1 text-5xl font-semibold leading-none">
          What will you <span className="accent">grow?</span>
        </h1>
        <p className="mt-2 text-bark">{r ? `Advice for ${r.placeName}, worked out from its real 10-year climate.` : 'Set your region first so the advice fits your weather.'}</p>
      </header>

      {r === null ? (
        <Panel>
          <p className="text-bark">Go to the Rover screen and choose your region, then come back.</p>
        </Panel>
      ) : (
        <>
          <form onSubmit={submit} className="flex gap-2" role="search">
            <label className="relative flex-1">
              <span className="sr-only">Plant name</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-bark" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any plant: okra, curry leaf, rose…"
                maxLength={40}
                className="h-13 w-full rounded-full border-[1.5px] border-line bg-card pl-11 pr-4 text-base focus:border-moss focus:outline-none"
              />
            </label>
            <button type="submit" disabled={state.kind === 'loading'} className="clay h-13 cursor-pointer rounded-full bg-moss px-6 font-semibold text-cream disabled:cursor-wait">
              Guide me
            </button>
          </form>
          <div className="flex flex-wrap gap-2" aria-label="Common crops">
            {QUICK_PICKS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void lookUp(p)}
                className="min-h-10 cursor-pointer rounded-full bg-card px-4 text-[14px] font-semibold text-bark ring-1 ring-line hover:text-soil hover:ring-moss"
              >
                {p}
              </button>
            ))}
          </div>

          {state.kind === 'loading' && <p className="accent text-xl text-bark">Reading {r?.placeName}'s seasons for {state.plant}…</p>}
          {state.kind === 'unavailable' && (
            <Panel>
              <p className="text-bark">Grow guides need the live backend (Supabase + the API with a Gemini key). REPLAY mode can't write them.</p>
            </Panel>
          )}
          {state.kind === 'error' && (
            <p className="rounded-2xl bg-terracotta/10 px-4 py-2 font-semibold text-terracotta-ink ring-1 ring-terracotta/40" role="alert">
              {state.message}
            </p>
          )}
          {state.kind === 'done' && r && <GuideCard result={state.result} region={r} />}
        </>
      )}
    </div>
  )
}

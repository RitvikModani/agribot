import { useEffect, useState } from 'react'
import { Sprout } from 'lucide-react'
import { source } from './data'
import type { Session } from './data/types'
import { useNow, useRover } from './hooks/useRover'
import { useRegion } from './hooks/useRegion'
import { isOnline, relativeTime, verdictView } from './lib/status'
import { Nav, ReplayBanner, StatusChip, Ticker, type Tab } from './components/ui'
import { FieldLog } from './screens/FieldLog'
import { Live } from './screens/Live'
import { Login } from './screens/Login'
import { RoverScreen } from './screens/Rover'

const TAB_HASH: Record<Tab, string> = { live: '#/live', log: '#/log', rover: '#/rover' }
const tabFromHash = (): Tab => (window.location.hash === '#/log' ? 'log' : window.location.hash === '#/rover' ? 'rover' : 'live')

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    source.getSession().then(setSession, () => setSession(null))
    return source.onAuthChange(setSession)
  }, [])

  if (session === undefined) return <p className="display p-6 text-xl italic text-bark">Waking the rover…</p>
  if (!session) return <Login onSignIn={(e, p) => source.signIn(e, p)} />
  return <Console session={session} />
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-10 place-items-center rounded-full bg-sprout text-soil">
        <Sprout className="size-6" aria-hidden="true" />
      </span>
      <span className="leading-none">
        <span className="display block text-[2rem] font-bold italic">AgriBot</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.25em] text-cream/60">Field journal</span>
      </span>
    </span>
  )
}

function Console({ session }: { session: Session }) {
  const model = useRover(source)
  const region = useRegion(source)
  const now = useNow(1000)
  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (t: Tab) => {
    window.location.hash = TAB_HASH[t]
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  const rover = model.rover
  const online = rover ? isOnline(rover.device.lastSeenAt, now) : false
  const latest = model.captures[0]
  const weather = region.forecast?.now
  const ticker = [
    ...(region.region && weather ? [`${region.region.placeName} ${Math.round(weather.temp)}°C · ${Math.round(weather.rh)}% humidity`] : []),
    `Rover ${online ? 'online' : 'offline'}`,
    `Seen ${relativeTime(rover?.device.lastSeenAt ?? null, now)}`,
    `Patrol ${rover?.state.patrolOn ? `on · ${rover.state.patrolIntervalS}s` : 'off'}`,
    `Bed ${rover?.state.plantTag ?? '—'}`,
    `${model.captures.length} specimens logged`,
    `Last: ${latest ? verdictView(latest).headline : '—'}`,
    'Model tomato-tm-v1 · 10 tomato diseases',
  ]

  return (
    <div className="min-h-dvh pb-24 lg:pb-10">
      {source.kind === 'replay' && <ReplayBanner />}
      <div className="soil-band rounded-b-[1.75rem] pb-4 shadow-[0_4px_0_rgb(51_36_26/0.18)]">
        <Ticker items={ticker} />
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
          <a href="#/live" onClick={() => go('live')} aria-label="AgriBot home">
            <Wordmark />
          </a>
          <div className="hidden lg:block">
            <Nav tab={tab} onTab={go} docked={false} />
          </div>
          {rover && <StatusChip online={online} />}
        </header>
      </div>
      {model.error && (
        <p role="alert" className="mx-auto mt-4 max-w-6xl rounded-xl bg-terracotta/10 px-4 py-2 text-sm font-semibold text-terracotta ring-1 ring-terracotta/40">
          {model.error}
        </p>
      )}
      <main className="mx-auto mt-5 max-w-6xl px-4">
        {tab === 'live' && <Live model={model} source={source} region={region} onOpenRover={() => go('rover')} />}
        {tab === 'log' && <FieldLog model={model} source={source} />}
        {tab === 'rover' && <RoverScreen model={model} source={source} session={session} region={region} />}
      </main>
      <div className="lg:hidden">
        <Nav tab={tab} onTab={go} docked />
      </div>
    </div>
  )
}

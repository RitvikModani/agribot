import { useEffect, useState } from 'react'
import { Crosshair } from 'lucide-react'
import { source } from './data'
import type { Session } from './data/types'
import { useNow, useRover } from './hooks/useRover'
import { isOnline, relativeTime, verdictView } from './lib/status'
import { Label, Nav, ReplayBanner, StatusChip, Ticker, type Tab } from './components/ui'
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

  if (session === undefined) return <Label className="block p-6">Starting…</Label>
  if (!session) return <Login onSignIn={(e, p) => source.signIn(e, p)} />
  return <Console session={session} />
}

function Console({ session }: { session: Session }) {
  const model = useRover(source)
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
  const ticker = [
    `Rover ${online ? 'online' : 'offline'}`,
    `Seen ${relativeTime(rover?.device.lastSeenAt ?? null, now)}`,
    `Patrol ${rover?.state.patrolOn ? `on · ${rover.state.patrolIntervalS}s` : 'off'}`,
    `Tag ${rover?.state.plantTag ?? '—'}`,
    `Captures ${model.captures.length}`,
    `Last ${latest ? verdictView(latest).headline : '—'}`,
    'Model tomato-tm-v1 · 10 classes · tomato only',
  ]

  return (
    <div className="min-h-dvh pb-20 lg:pb-8">
      {source.kind === 'replay' && <ReplayBanner />}
      <Ticker items={ticker} />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <a href="#/live" onClick={() => go('live')} className="flex items-center gap-2" aria-label="AgriBot home">
          <Crosshair className="size-7 text-chlorophyll" aria-hidden="true" />
          <span className="condensed font-display text-4xl font-black uppercase leading-none">
            Agri<span className="text-chlorophyll">bot</span>
          </span>
        </a>
        <div className="hidden lg:block">
          <Nav tab={tab} onTab={go} />
        </div>
        {rover && <StatusChip online={online} />}
      </header>
      {model.error && (
        <p role="alert" className="mx-auto mb-3 max-w-6xl border-2 border-rust px-4 py-2 font-mono text-sm text-rust">
          {model.error}
        </p>
      )}
      <main className="mx-auto max-w-6xl px-4">
        {tab === 'live' && <Live model={model} source={source} onOpenRover={() => go('rover')} />}
        {tab === 'log' && <FieldLog model={model} source={source} />}
        {tab === 'rover' && <RoverScreen model={model} source={source} session={session} />}
      </main>
      <div className="lg:hidden">
        <Nav tab={tab} onTab={go} />
      </div>
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { Copy, KeyRound, LogOut, ShieldOff, Zap } from 'lucide-react'
import { API_URL } from '../data'
import type { DataSource, Session } from '../data/types'
import { useNow, type RoverModel } from '../hooks/useRover'
import { isOnline, relativeTime } from '../lib/status'
import { Label, Panel, StatusChip } from '../components/ui'

export function RoverScreen({ model, source, session }: { model: RoverModel; source: DataSource; session: Session }) {
  const now = useNow(1000)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { rover } = model

  async function issue(action: () => Promise<string>) {
    setBusy(true)
    try {
      setToken(await action())
      await model.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rover === null && <CreateRover busy={busy} onCreate={(name) => issue(() => source.createDevice(name))} />}

      {rover && (
        <Panel className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="condensed font-display text-6xl font-black uppercase leading-none">{rover.device.name}</h1>
            <StatusChip online={isOnline(rover.device.lastSeenAt, now)} />
          </div>
          <dl className="grid grid-cols-2 gap-3 font-mono text-sm sm:grid-cols-4">
            <Fact term="Last seen" value={relativeTime(rover.device.lastSeenAt, now)} />
            <Fact term="Patrol" value={rover.state.patrolOn ? `On · ${rover.state.patrolIntervalS}s` : 'Off'} />
            <Fact term="Plant tag" value={rover.state.plantTag ?? '—'} />
            <Fact term="Since" value={new Date(rover.device.createdAt).toLocaleDateString()} />
          </dl>
        </Panel>
      )}

      {rover && (
        <Panel className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-chlorophyll" aria-hidden="true" />
            <Label>Device token</Label>
          </div>
          {rover.device.revokedAt ? (
            <p className="border-2 border-rust px-3 py-2 text-rust">Revoked. The rover is locked out until you issue a new token.</p>
          ) : (
            <p className="text-stalk">The camera proves who it is with this token. Only its hash is stored, so a lost token can't be shown again, only replaced.</p>
          )}
          {token && <TokenReveal token={token} replay={source.kind === 'replay'} />}
          <div className="grid gap-2 sm:grid-cols-2">
            <ConfirmButton label="Issue new token" confirm="Old token stops working · confirm" disabled={busy} tone="go" onConfirm={() => issue(() => source.rotateToken(rover.device.id))} />
            <ConfirmButton
              label="Revoke"
              confirm="Lock the rover out · confirm"
              disabled={busy || rover.device.revokedAt !== null}
              tone="danger"
              icon={<ShieldOff className="size-4" aria-hidden="true" />}
              onConfirm={async () => {
                await source.revoke(rover.device.id)
                await model.reload()
              }}
            />
          </div>
        </Panel>
      )}

      <WakeApi />

      <Panel className="space-y-2">
        <Label>Model</Label>
        <p className="condensed font-display text-3xl font-black uppercase">tomato-tm-v1</p>
        <ul className="space-y-1 text-sm text-stalk">
          <li>10 tomato leaf classes. Other crops will be misread.</li>
          <li>78.5% on a 200-image PlantVillage lab sample (model/EVAL.md).</li>
          <li>Not yet validated on real field photos.</li>
        </ul>
      </Panel>

      <Panel className="flex items-center justify-between gap-3">
        <div>
          <Label>Signed in</Label>
          <p className="mt-1 font-mono text-sm">{session.email}</p>
        </div>
        {source.kind === 'supabase' && (
          <button type="button" onClick={() => void source.signOut()} className="flex h-11 cursor-pointer items-center gap-2 border-2 border-furrow px-4 font-mono text-[12px] font-bold uppercase tracking-widest text-stalk hover:text-bone">
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        )}
      </Panel>
    </div>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-stalk">{term}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  )
}

function CreateRover({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('AgriBot-01')
  return (
    <Panel className="space-y-3 lg:col-span-2">
      <h1 className="condensed font-display text-5xl font-black uppercase leading-none">Create your rover</h1>
      <p className="text-stalk">This registers the camera and gives you its token, shown once. Paste it into the AgriBot-Setup portal.</p>
      <label className="block">
        <Label>Rover name</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-1.5 h-11 w-full border-2 border-furrow bg-soil px-3 font-mono text-base focus:border-chlorophyll focus:outline-none" />
      </label>
      <button type="button" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim())} className="h-12 w-full cursor-pointer border-2 border-chlorophyll bg-chlorophyll font-mono text-sm font-bold uppercase tracking-widest text-soil disabled:opacity-50">
        Create rover
      </button>
    </Panel>
  )
}

function TokenReveal({ token, replay }: { token: string; replay: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2 border-2 border-chlorophyll p-3">
      <Label className="text-chlorophyll">{replay ? 'Replay mode: not a real token' : 'Shown once — copy it now'}</Label>
      <code className="block break-all bg-soil p-2 font-mono text-sm text-bone">{token}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(token)
          setCopied(true)
        }}
        className="flex h-11 cursor-pointer items-center gap-2 border-2 border-chlorophyll px-4 font-mono text-[12px] font-bold uppercase tracking-widest text-chlorophyll"
      >
        <Copy className="size-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy token'}
      </button>
      <p className="text-xs text-stalk">On the camera: press RST twice → join Wi-Fi “AgriBot-Setup” → paste into Device token.</p>
    </div>
  )
}

function ConfirmButton({
  label,
  confirm,
  disabled,
  tone,
  icon,
  onConfirm,
}: {
  label: string
  confirm: string
  disabled: boolean
  tone: 'go' | 'danger'
  icon?: ReactNode
  onConfirm: () => Promise<void> | void
}) {
  const [armed, setArmed] = useState(false)
  const armedLook = tone === 'go' ? 'border-chlorophyll bg-chlorophyll text-soil' : 'border-rust bg-rust text-soil'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (!armed) return setArmed(true)
        setArmed(false)
        await onConfirm()
      }}
      onBlur={() => setArmed(false)}
      className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 border-2 px-3 font-mono text-[12px] font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40 ${
        armed ? armedLook : 'border-furrow text-bone hover:border-bone'
      }`}
    >
      {icon}
      {armed ? confirm : label}
    </button>
  )
}

function WakeApi() {
  const [result, setResult] = useState<string>('')
  const [busy, setBusy] = useState(false)
  async function ping() {
    if (!API_URL) return setResult('VITE_API_URL is not set for this build.')
    setBusy(true)
    setResult('Waking… a sleeping Space can take up to a minute.')
    const started = performance.now()
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 90_000)
    try {
      const r = await fetch(`${API_URL}/healthz`, { signal: abort.signal })
      const body = (await r.json()) as { model_version?: string }
      setResult(`HTTP ${r.status} · ${Math.round(performance.now() - started)} ms · ${body.model_version ?? '?'}`)
    } catch (e) {
      setResult(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      clearTimeout(timer)
      setBusy(false)
    }
  }
  return (
    <Panel className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="size-5 text-chlorophyll" aria-hidden="true" />
        <Label>Inference API</Label>
      </div>
      <p className="break-all font-mono text-sm text-stalk">{API_URL || 'not configured'}</p>
      <button type="button" onClick={ping} disabled={busy} className="h-12 w-full cursor-pointer border-2 border-chlorophyll font-mono text-sm font-bold uppercase tracking-widest text-chlorophyll hover:bg-chlorophyll hover:text-soil disabled:cursor-wait">
        Wake API
      </button>
      {result && (
        <p className="font-mono text-sm" role="status">
          {result}
        </p>
      )}
    </Panel>
  )
}

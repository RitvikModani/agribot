import { useState, type ReactNode } from 'react'
import { Copy, Cpu, KeyRound, LogOut, ShieldOff, Sprout, Zap } from 'lucide-react'
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
    <div className="grid gap-5 lg:grid-cols-2">
      {rover === null && <CreateRover busy={busy} onCreate={(name) => issue(() => source.createDevice(name))} />}

      {rover && (
        <Panel className="relative space-y-4 overflow-hidden lg:col-span-2">
          <Sprout className="pointer-events-none absolute -bottom-8 right-2 size-40 text-moss/[0.07]" aria-hidden="true" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label>Your rover</Label>
              <h1 className="display mt-1 text-5xl font-bold leading-none">{rover.device.name}</h1>
            </div>
            <StatusChip online={isOnline(rover.device.lastSeenAt, now)} />
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact term="Last seen" value={relativeTime(rover.device.lastSeenAt, now)} />
            <Fact term="Patrol" value={rover.state.patrolOn ? `On · ${rover.state.patrolIntervalS}s` : 'Off'} />
            <Fact term="Bed tag" value={rover.state.plantTag ?? '—'} />
            <Fact term="Since" value={new Date(rover.device.createdAt).toLocaleDateString()} />
          </dl>
        </Panel>
      )}

      {rover && (
        <Panel className="space-y-4">
          <Label icon={KeyRound}>Device token</Label>
          {rover.device.revokedAt ? (
            <p className="rounded-xl bg-terracotta/10 px-4 py-3 font-semibold text-terracotta ring-1 ring-terracotta/40">Revoked. The rover is locked out until you issue a new token.</p>
          ) : (
            <p className="text-bark">The camera proves who it is with this token. Only its hash is stored, so a lost token can't be shown again, only replaced.</p>
          )}
          {token && <TokenReveal token={token} replay={source.kind === 'replay'} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <ConfirmButton label="Issue new token" confirm="Old one stops working · confirm" disabled={busy} tone="go" onConfirm={() => issue(() => source.rotateToken(rover.device.id))} />
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
        <Label icon={Cpu}>Model</Label>
        <p className="display text-3xl font-bold">tomato-tm-v1</p>
        <ul className="list-inside list-disc space-y-1 text-[15px] text-bark marker:text-sprout">
          <li>10 tomato leaf diseases. Other crops will be misread.</li>
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
          <button type="button" onClick={() => void source.signOut()} className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-inset px-4 font-semibold text-bark ring-1 ring-line hover:text-soil">
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        )}
      </Panel>
    </div>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-xl bg-inset px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-bark">{term}</dt>
      <dd className="mt-0.5 truncate font-semibold">{value}</dd>
    </div>
  )
}

function CreateRover({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('AgriBot-01')
  return (
    <Panel className="space-y-4 lg:col-span-2">
      <Sprout className="size-10 text-moss" aria-hidden="true" />
      <h1 className="display text-5xl font-bold leading-none">Plant your rover</h1>
      <p className="text-bark">This registers the camera and gives you its token, shown once. Paste it into the AgriBot-Setup portal.</p>
      <label className="block">
        <Label>Rover name</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-2 h-12 w-full rounded-xl border-[1.5px] border-line bg-paper px-4 text-base focus:border-moss focus:outline-none" />
      </label>
      <button type="button" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim())} className="clay h-13 w-full cursor-pointer rounded-xl bg-moss font-semibold text-cream disabled:opacity-50">
        Create rover
      </button>
    </Panel>
  )
}

function TokenReveal({ token, replay }: { token: string; replay: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-3 rounded-xl border-[1.5px] border-dashed border-moss bg-sprout/15 p-4">
      <Label className="text-moss">{replay ? 'Replay mode: not a real token' : 'Shown once. Copy it now'}</Label>
      <code className="block break-all rounded-lg bg-soil p-3 font-mono text-sm text-cream">{token}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(token)
          setCopied(true)
        }}
        className="clay flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-moss px-4 font-semibold text-cream"
      >
        <Copy className="size-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy token'}
      </button>
      <p className="text-[13px] text-bark">On the camera: press RST twice, join the Wi-Fi “AgriBot-Setup”, paste it into Device token.</p>
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
  const armedLook = tone === 'go' ? 'bg-moss text-cream [--lip:var(--color-moss-deep)]' : 'bg-terracotta text-cream [--lip:#6e2f15]'
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
      className={`clay flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        armed ? armedLook : 'bg-inset text-soil [--lip:var(--color-line)]'
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
      <Label icon={Zap}>Inference API</Label>
      <p className="break-all font-mono text-sm text-bark">{API_URL || 'not configured'}</p>
      <button type="button" onClick={ping} disabled={busy} className="clay h-12 w-full cursor-pointer rounded-xl bg-ochre font-semibold text-soil [--lip:var(--color-ochre-deep)] disabled:cursor-wait">
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

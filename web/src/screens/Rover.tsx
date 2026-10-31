import { useState, type ReactNode } from 'react'
import {
  Camera,
  Copy,
  Cpu,
  FlipHorizontal2,
  FlipVertical2,
  KeyRound,
  LogOut,
  MapPin,
  Minus,
  Plus,
  ShieldOff,
  Sprout,
  SunMedium,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { API_URL } from '../data'
import type { DataSource, Session } from '../data/types'
import { useNow, type RoverModel } from '../hooks/useRover'
import type { RegionModel } from '../hooks/useRegion'
import { EXPOSURE_MAX, EXPOSURE_MIN, exposureLabel, exposureValue, stepExposure } from '../lib/camera'
import { isOnline, relativeTime } from '../lib/status'
import { Label, Panel, StatusChip } from '../components/ui'
import { ClimateBars, RegionPicker, regionLine } from '../components/weather'
import { WaveBand } from '../components/verdeo'

export function RoverScreen({ model, source, session, region }: { model: RoverModel; source: DataSource; session: Session; region: RegionModel }) {
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
              <h1 className="display mt-1 text-5xl font-semibold leading-none">{rover.device.name}</h1>
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

      {rover && <CameraPanel model={model} online={isOnline(rover.device.lastSeenAt, now)} />}

      {rover && (
        <Panel className="space-y-4">
          <Label icon={KeyRound}>Device token</Label>
          {rover.device.revokedAt ? (
            <p className="rounded-2xl bg-terracotta/10 px-4 py-3 font-semibold text-terracotta-ink ring-1 ring-terracotta/40">Revoked. The rover is locked out until you issue a new token.</p>
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

      <RegionPanel region={region} />

      <WakeApi />

      <Panel className="space-y-2">
        <Label icon={Cpu}>Model</Label>
        <p className="display text-3xl font-semibold">tomato-tm-v1</p>
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
          <button type="button" onClick={() => void source.signOut()} className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-inset px-4 font-semibold text-bark ring-1 ring-line hover:text-soil">
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        )}
      </Panel>
    </div>
  )
}

function CameraPanel({ model, online }: { model: RoverModel; online: boolean }) {
  const state = model.rover!.state
  const exposure = state.camExposure
  const setExposure = (delta: number) => {
    const next = stepExposure(exposure, delta)
    if (next !== exposure) void model.updateControls({ camExposure: next })
  }
  const stepper = 'clay grid size-11 cursor-pointer place-items-center rounded-full bg-inset text-soil [--lip:var(--color-line)] disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <Panel className="space-y-5">
      <div>
        <Label icon={Camera}>Camera</Label>
        <p className="mt-1 text-[15px] text-bark">
          {online ? 'The camera picks changes up within a few seconds. Capture again to see them.' : 'Rover offline. Changes are saved and apply when it reconnects.'}
        </p>
      </div>
      <div>
        <Label icon={SunMedium}>Exposure</Label>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={() => setExposure(-1)} disabled={exposure <= EXPOSURE_MIN} aria-label="Darker" className={stepper}>
            <Minus className="size-5" aria-hidden="true" />
          </button>
          <div className="flex-1 text-center" aria-live="polite">
            <span className="display text-4xl font-semibold tabular-nums">{exposureValue(exposure)}</span>
            <span className="ml-1.5 text-sm text-bark">{exposureLabel(exposure)}</span>
          </div>
          <button type="button" onClick={() => setExposure(1)} disabled={exposure >= EXPOSURE_MAX} aria-label="Brighter" className={stepper}>
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden="true">
          {[-2, -1, 0, 1, 2].map((v) => (
            <span key={v} className={`h-1.5 rounded-full ${v === exposure ? 'bg-ochre' : v < exposure ? 'bg-ochre/40' : 'bg-line'}`} />
          ))}
        </div>
        <p className="mt-2 text-[13px] text-bark">Shifts what the auto-exposure aims for. Washed-out photos: try −1.</p>
      </div>
      <div className="grid gap-3">
        <SwitchRow icon={FlipHorizontal2} label="Mirror" hint="Swap left and right" checked={state.camHmirror} onToggle={() => void model.updateControls({ camHmirror: !state.camHmirror })} />
        <SwitchRow icon={FlipVertical2} label="Flip" hint="Turn upside down" checked={state.camVflip} onToggle={() => void model.updateControls({ camVflip: !state.camVflip })} />
      </div>
    </Panel>
  )
}

function SwitchRow({ icon: Icon, label, hint, checked, onToggle }: { icon: LucideIcon; label: string; hint: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-inset px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-5 shrink-0 text-moss" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{label}</p>
          <p className="truncate text-[13px] text-bark">{hint}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-9 w-16 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${checked ? 'bg-moss' : 'bg-paper ring-1 ring-inset ring-line'}`}
      >
        <span className={`absolute top-1 size-7 rounded-full shadow-[0_2px_0_rgb(51_36_26/0.25)] transition-[left] duration-150 ${checked ? 'left-8 bg-cream' : 'left-1 bg-bark/60'}`} />
      </button>
    </div>
  )
}

function RegionPanel({ region }: { region: RegionModel }) {
  const [changing, setChanging] = useState(false)
  const r = region.region
  return (
    <div>
      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label icon={MapPin}>Your region</Label>
          {r && (
            <button type="button" onClick={() => setChanging((c) => !c)} className="cursor-pointer text-sm font-semibold text-moss underline-offset-4 hover:underline">
              {changing ? 'Cancel' : 'Change'}
            </button>
          )}
        </div>
        {r ? <p className="display text-3xl font-semibold leading-tight">{regionLine(r)}</p> : <p className="text-bark">Not set yet. Pick where your field is.</p>}
        {(changing || r === null) && (
          <RegionPicker
            onPick={async (picked) => {
              await region.save(picked)
              setChanging(false)
            }}
          />
        )}
        {region.error && <p className="text-sm font-semibold text-terracotta-ink">{region.error}</p>}
      </Panel>
      {r && (
        <WaveBand className="mt-2">
          <ClimateBars normals={region.climate} onBand />
        </WaveBand>
      )}
    </div>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-2xl bg-inset px-3 py-2">
      <dt className="text-[12px] font-semibold tracking-[0.08em] text-bark">{term}</dt>
      <dd className="mt-0.5 truncate font-semibold">{value}</dd>
    </div>
  )
}

function CreateRover({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('AgriBot-01')
  return (
    <Panel className="space-y-4 lg:col-span-2">
      <Sprout className="size-10 text-moss" aria-hidden="true" />
      <h1 className="display text-5xl font-semibold leading-none">
        Plant your <span className="accent">rover</span>
      </h1>
      <p className="text-bark">This registers the camera and gives you its token, shown once. Paste it into the AgriBot-Setup portal.</p>
      <label className="block">
        <Label>Rover name</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="mt-2 h-12 w-full rounded-full border-[1.5px] border-line bg-paper px-4 text-base focus:border-moss focus:outline-none" />
      </label>
      <button type="button" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim())} className="clay h-13 w-full cursor-pointer rounded-full bg-moss font-semibold text-cream disabled:opacity-50">
        Create rover
      </button>
    </Panel>
  )
}

function TokenReveal({ token, replay }: { token: string; replay: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-3 rounded-2xl border-[1.5px] border-dashed border-moss bg-sprout/15 p-4">
      <Label className="text-moss">{replay ? 'Replay mode: not a real token' : 'Shown once. Copy it now'}</Label>
      <code className="block break-all rounded-lg bg-soil p-3 font-mono text-sm text-cream">{token}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(token)
          setCopied(true)
        }}
        className="clay flex h-11 cursor-pointer items-center gap-2 rounded-full bg-moss px-4 font-semibold text-cream"
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
      className={`clay flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
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
    setResult('Waking… a sleeping server can take up to a minute.')
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
      <button type="button" onClick={ping} disabled={busy} className="clay h-12 w-full cursor-pointer rounded-full bg-ochre font-semibold text-soil [--lip:var(--color-ochre-deep)] disabled:cursor-wait">
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

import type { LabelKey } from '../lib/labels'
import type { Verdict } from '../lib/status'
import type { Capture, DataSource, Device, DeviceState, Subscription } from './types'

/** Precomputed by web/scripts/build_replay.py with the real ONNX model and API preprocessing. */
interface ReplayItem {
  file: string
  label: LabelKey
  confidence: number
  verdict: Verdict
  leaf_fraction: number
  top3: { label: LabelKey; confidence: number }[]
  truth: LabelKey | null
  source: string
}

const CAPTURE_DELAY_MS = 1400
const MODEL_VERSION = 'tomato-tm-v1'

/**
 * Offline stand-in for the backend: a simulated rover that "captures" recorded
 * samples. Used for local development and as the on-stage fallback when the
 * network dies. The UI always shows a REPLAY banner while this is active.
 */
export function createReplaySource(base: string): DataSource {
  const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString()
  const device: Device = { id: 'replay-rover', name: 'AgriBot · replay', createdAt: iso(86_400_000), lastSeenAt: iso(), revokedAt: null }
  let state: DeviceState = { deviceId: device.id, patrolOn: false, patrolIntervalS: 10, captureRequestedAt: null, plantTag: 'demo-bed' }
  const captures: Capture[] = []
  const listeners = new Set<Subscription>()
  let items: ReplayItem[] = []
  let cursor = 0
  let loading: Promise<void> | null = null
  let patrolTimer: ReturnType<typeof setInterval> | undefined

  const emitState = () => listeners.forEach((l) => l.onState({ ...state }))

  const toCapture = (item: ReplayItem, createdAt: string): Capture => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    createdAt,
    imagePath: item.file,
    label: item.label,
    confidence: item.confidence,
    verdict: item.verdict,
    leafFraction: item.leaf_fraction,
    top3: item.top3,
    modelVersion: MODEL_VERSION,
    plantTag: state.plantTag,
    truth: item.truth,
    source: item.source,
  })

  function load(): Promise<void> {
    loading ??= fetch(`${base}replay/replay.json`)
      .then((r) => r.json() as Promise<ReplayItem[]>)
      .then((data) => {
        items = data
        // Seed a little history so the field log isn't empty on first open.
        const seed = Math.min(6, items.length)
        // Newest first, matching listCaptures order.
        for (let i = 0; i < seed; i++) captures.push(toCapture(items[i], iso((i + 1) * 95_000)))
        cursor = seed
      })
    return loading
  }

  function captureNext(manual: boolean) {
    setTimeout(() => {
      if (!items.length) return
      const c = toCapture(items[cursor++ % items.length], iso())
      captures.unshift(c)
      listeners.forEach((l) => l.onCapture(c))
      if (manual) {
        state = { ...state, captureRequestedAt: null }
        emitState()
      }
    }, CAPTURE_DELAY_MS)
  }

  function schedulePatrol() {
    clearInterval(patrolTimer)
    if (state.patrolOn) patrolTimer = setInterval(() => captureNext(false), state.patrolIntervalS * 1000)
  }

  return {
    kind: 'replay',
    async getSession() {
      return { email: 'replay@agribot.local' }
    },
    onAuthChange() {
      return () => {}
    },
    async signIn() {},
    async signOut() {},

    async getRover() {
      await load()
      return { device: { ...device, lastSeenAt: iso() }, state: { ...state } }
    },
    async createDevice() {
      return 'agb_REPLAY-not-a-real-token-connect-supabase-first'
    },
    async rotateToken() {
      return 'agb_REPLAY-not-a-real-token-connect-supabase-first'
    },
    async revoke() {},

    async requestCapture() {
      state = { ...state, captureRequestedAt: iso() }
      emitState()
      captureNext(true)
    },

    async updateControls(_id, patch) {
      state = { ...state, ...patch }
      emitState()
      schedulePatrol()
    },

    async listCaptures({ limit, before }) {
      await load()
      return captures.filter((c) => !before || c.createdAt < before).slice(0, limit)
    },

    async deleteCapture(c) {
      const i = captures.findIndex((x) => x.id === c.id)
      if (i >= 0) captures.splice(i, 1)
    },

    async imageUrl(path) {
      return `${base}replay/${path}`
    },

    subscribe(s) {
      listeners.add(s)
      const heartbeat = setInterval(() => s.onDevice({ ...device, lastSeenAt: iso() }), 2000)
      return () => {
        clearInterval(heartbeat)
        listeners.delete(s)
      }
    },
  }
}

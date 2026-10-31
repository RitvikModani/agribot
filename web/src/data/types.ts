import type { LabelKey } from '../lib/labels'
import type { Verdict } from '../lib/status'
import type { Region } from '../lib/weather'
import type { GuideResult } from '../lib/guide'
import type { AiResult, AiStatus } from '../lib/diagnosis'

export interface Capture {
  id: string
  deviceId: string
  createdAt: string
  imagePath: string
  label: LabelKey
  confidence: number
  verdict: Verdict
  leafFraction: number
  top3: { label: LabelKey; confidence: number }[]
  modelVersion: string
  plantTag: string | null
  /** Whole-plant diagnosis (Gemini vision), filled in a few seconds after the capture. */
  aiStatus: AiStatus
  ai: AiResult
  aiModel: string | null
  /** Ground truth, only known for replay samples. */
  truth?: LabelKey | null
  source?: string
}

export interface Device {
  id: string
  name: string
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}

export interface DeviceState {
  deviceId: string
  patrolOn: boolean
  patrolIntervalS: number
  captureRequestedAt: string | null
  plantTag: string | null
  camExposure: number // -2 (darker) .. +2 (brighter)
  camHmirror: boolean
  camVflip: boolean
}

export interface Rover {
  device: Device
  state: DeviceState
}

export interface Session {
  email: string
}

export type ControlPatch = Partial<
  Pick<DeviceState, 'patrolOn' | 'patrolIntervalS' | 'plantTag' | 'camExposure' | 'camHmirror' | 'camVflip'>
>

export interface CaptureQuery {
  limit: number
  before?: string
}

export interface Subscription {
  onCapture(c: Capture): void
  onDevice(d: Device): void
  onState(s: DeviceState): void
  /** The live connection came back after a gap (or the tab woke up): refetch what may have been missed. */
  onResync?(): void
}

/** Everything the UI needs. Implemented by Supabase (live) and Replay (offline/demo fallback). */
export interface DataSource {
  kind: 'supabase' | 'replay'
  getSession(): Promise<Session | null>
  onAuthChange(cb: (s: Session | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  getRover(): Promise<Rover | null>
  createDevice(name: string): Promise<string>
  rotateToken(deviceId: string): Promise<string>
  revoke(deviceId: string): Promise<void>
  requestCapture(deviceId: string): Promise<void>
  updateControls(deviceId: string, patch: ControlPatch): Promise<void>
  listCaptures(q: CaptureQuery): Promise<Capture[]>
  deleteCapture(c: Capture): Promise<void>
  imageUrl(path: string): Promise<string>
  subscribe(s: Subscription): () => void
  getRegion(): Promise<Region | null>
  saveRegion(r: Region): Promise<void>
  /** Real nearby shops for a disease's remedy; null when this source can't search (Replay). */
  findShops(label: LabelKey, region: Region): Promise<ShopResult | null>
  /** A grow guide for this plant in this region; null when this source can't ask (Replay). */
  getGuide(plant: string, region: Region): Promise<GuideResult | null>
}

export interface ShopResult {
  shops: { name: string; url: string }[]
  summary: string
  ingredients: string[]
  cached: boolean
}

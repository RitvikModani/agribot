import { LABEL_NAME, type LabelKey } from './labels'

// Check-ins are recorded every 5 s at best and pause while a photo uploads, so 10 s flapped to "offline".
export const ONLINE_WINDOW_MS = 30_000
export const REQUEST_STALL_MS = 15_000
export const LOW_CONFIDENCE = 0.6

export type Verdict = 'confident' | 'uncertain' | 'no_leaf'
export type Tone = 'healthy' | 'disease' | 'uncertain' | 'none'
export type RequestStatus = 'idle' | 'pending' | 'stalled'

export function isOnline(lastSeenAt: string | null, now: number): boolean {
  if (!lastSeenAt) return false
  return now - Date.parse(lastSeenAt) < ONLINE_WINDOW_MS
}

export function captureRequestStatus(requestedAt: string | null, now: number): RequestStatus {
  if (!requestedAt) return 'idle'
  return now - Date.parse(requestedAt) < REQUEST_STALL_MS ? 'pending' : 'stalled'
}

export function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

export function confidenceBlocks(confidence: number, total = 10): number {
  return Math.max(0, Math.min(total, Math.round(confidence * total)))
}

export interface VerdictView {
  tone: Tone
  headline: string
  detail: string
  showRemedy: boolean
}

export function verdictView(c: { verdict: Verdict; label: LabelKey; confidence: number }): VerdictView {
  const name = LABEL_NAME[c.label]
  if (c.verdict === 'no_leaf') {
    return { tone: 'none', headline: 'No leaf in frame', detail: 'Aim at a single tomato leaf, about 20 cm away.', showRemedy: false }
  }
  if (c.verdict === 'uncertain') {
    return { tone: 'uncertain', headline: 'Uncertain — retake', detail: `Best guess ${name} at ${pct(c.confidence)}. Too low to act on.`, showRemedy: false }
  }
  if (c.label === 'healthy') {
    return { tone: 'healthy', headline: 'Healthy', detail: `${pct(c.confidence)} confidence`, showRemedy: true }
  }
  return { tone: 'disease', headline: name, detail: `${pct(c.confidence)} confidence`, showRemedy: true }
}

export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

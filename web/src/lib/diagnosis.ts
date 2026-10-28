import type { Capture } from '../data/types'
import { verdictView, type Tone } from './status'

/** Whole-plant diagnosis from Gemini vision, saved on the capture row by the API (see api/app/diagnosis.py). */
export type AiStatus = 'pending' | 'done' | 'failed' | 'skipped'
export type Severity = 'mild' | 'moderate' | 'severe'

export interface Finding {
  problem: string
  kind: 'disease' | 'pest' | 'nutrient' | 'other'
  severity: Severity
  /** [ymin, xmin, ymax, xmax] on 0-1000, or null when Gemini gave no usable box. */
  box_2d: number[] | null
  advice: string
  active_ingredient: string
}

export interface Diagnosis {
  plant_present: boolean
  common_name: string
  scientific_name: string
  health: 'healthy' | 'diseased' | 'unclear'
  summary: string
  findings: Finding[]
}

export type AiResult = Diagnosis | { reason: string } | null

const RANK: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 }

export function diagnosisOf(c: { aiStatus?: AiStatus; ai?: AiResult }): Diagnosis | null {
  return c.aiStatus === 'done' && c.ai && 'plant_present' in c.ai ? c.ai : null
}

export function worstFinding(d: Diagnosis): Finding | null {
  return d.findings.reduce<Finding | null>((worst, f) => (!worst || RANK[f.severity] > RANK[worst.severity] ? f : worst), null)
}

export interface Headline {
  text: string
  crop: string | null
  tone: Tone
  /** 'ai' once Gemini has answered, otherwise the fast tomato model. */
  source: 'ai' | 'model'
  note: string | null
}

export function headline(c: Capture): Headline {
  const d = diagnosisOf(c)
  if (d) {
    if (!d.plant_present) return { text: 'No plant in frame', crop: null, tone: 'none', source: 'ai', note: null }
    const crop = d.common_name || 'Plant'
    if (d.health === 'healthy') return { text: `${crop} · Healthy`, crop, tone: 'healthy', source: 'ai', note: null }
    if (d.health === 'unclear') return { text: `${crop} · Unclear, retake`, crop, tone: 'uncertain', source: 'ai', note: null }
    const worst = worstFinding(d)
    return { text: `${crop} · ${worst?.problem || 'Needs attention'}`, crop, tone: 'disease', source: 'ai', note: null }
  }
  const view = verdictView(c)
  const reason = c.ai && 'reason' in c.ai ? c.ai.reason : ''
  const note =
    c.aiStatus === 'pending' ? 'Reading the whole plant…' : c.aiStatus === 'failed' ? `Whole-plant check unavailable${reason ? `: ${reason}` : ''}` : null
  return { text: view.headline, crop: null, tone: view.tone, source: 'model', note }
}

const pct = (v: number) => `${Math.max(0, Math.min(1000, v)) / 10}%`

/** A 0-1000 box as CSS percentages over the photo. */
export function boxStyle(box: number[]): { top: string; left: string; width: string; height: string } {
  const [ymin, xmin, ymax, xmax] = box.map((v) => Math.max(0, Math.min(1000, v)))
  return { top: pct(ymin), left: pct(xmin), height: pct(ymax - ymin), width: pct(xmax - xmin) }
}

export function isTomato(c: { aiStatus?: AiStatus; ai?: AiResult }): boolean {
  return /tomato/i.test(diagnosisOf(c)?.common_name ?? '')
}

export function ingredientMapsUrl(ingredient: string, place: string): string {
  const q = new URLSearchParams({ api: '1', query: `${ingredient} pesticide shop near ${place}` })
  return `https://www.google.com/maps/search/?${q}`
}

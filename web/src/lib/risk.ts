import type { LabelKey } from './labels'

/** One hour of forecast. temp °C, rh %, rain mm, wind km/h. */
export interface Hour {
  time: string
  temp: number
  rh: number
  rain: number
  wind: number
}

export type RiskLevel = 'medium' | 'high'

export interface Risk {
  label: LabelKey
  level: RiskLevel
  hours: number
  reason: string
  /** Local time of the first hour that counts. */
  startsAt: string
}

interface Rule {
  label: LabelKey
  counts: (h: Hour) => boolean
  medium: number
  high: number
  conditions: string
}

// Simplified from published tomato-disease weather guidance. A guide, not a forecast model.
const RULES: Rule[] = [
  { label: 'late_blight', counts: (h) => h.rh >= 90 && h.temp >= 10 && h.temp <= 25, medium: 4, high: 10, conditions: 'very humid, 10–25 °C' },
  { label: 'early_blight', counts: (h) => h.temp >= 24 && h.temp <= 29 && (h.rain > 0 || h.rh >= 90), medium: 3, high: 8, conditions: 'warm and wet, 24–29 °C' },
  { label: 'septoria_leaf_spot', counts: (h) => h.temp >= 20 && h.temp <= 25 && h.rain > 0, medium: 2, high: 6, conditions: 'rainy, 20–25 °C' },
  { label: 'bacterial_spot', counts: (h) => h.temp >= 24 && h.temp <= 30 && h.rain >= 0.5, medium: 2, high: 6, conditions: 'warm rain, 24–30 °C' },
  { label: 'leaf_mold', counts: (h) => h.rh > 85 && h.temp >= 21 && h.temp <= 24, medium: 4, high: 12, conditions: 'humid, 21–24 °C' },
  { label: 'spider_mites', counts: (h) => h.temp >= 30 && h.rh < 45, medium: 4, high: 12, conditions: 'hot and dry, 30 °C+ under 45% humidity' },
]

/** Diseases the next 72 hours favour: medium/high only, highest first, at most three. */
export function diseaseRisks(hours: Hour[]): Risk[] {
  const window = hours.slice(0, 72)
  return RULES.map((rule) => {
    const matching = window.filter(rule.counts)
    const n = matching.length
    const level: RiskLevel | null = n >= rule.high ? 'high' : n >= rule.medium ? 'medium' : null
    return level && { label: rule.label, level, hours: n, reason: `${n} h of ${rule.conditions} weather`, startsAt: matching[0].time }
  })
    .filter((r): r is Risk => r !== null)
    .sort((a, b) => (a.level === b.level ? b.hours - a.hours : a.level === 'high' ? -1 : 1))
    .slice(0, 3)
}

export type SprayKind = 'rain' | 'wind' | 'heat' | 'good'

export interface SprayAdvice {
  kind: SprayKind
  message: string
}

/** Whether to spray a treatment now. hours[0] is the current hour. */
export function sprayWindow(hours: Hour[]): SprayAdvice {
  const rainAt = hours.slice(0, 25).findIndex((h) => h.rain >= 0.5)
  if (rainAt >= 0) {
    return {
      kind: 'rain',
      message: rainAt === 0 ? 'Raining now. Hold off and spray within a day after it clears.' : `Rain in ${rainAt} h. Hold off and spray within a day after it clears.`,
    }
  }
  const now = hours[0]
  if (now && now.wind >= 15) return { kind: 'wind', message: `Too windy (${Math.round(now.wind)} km/h). Spray would drift. Wait for calmer air.` }
  if (now && now.temp >= 32) return { kind: 'heat', message: `Hot (${Math.round(now.temp)} °C). Spray before 9 AM or after 5 PM so it doesn't burn the leaves.` }
  return { kind: 'good', message: 'Good spray window: dry, calm, and mild for the next few hours.' }
}

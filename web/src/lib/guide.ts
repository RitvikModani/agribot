import type { MonthNormal, Region } from './weather'

export interface Guide {
  recognized: boolean
  common_name?: string
  scientific_name?: string
  suitability?: 'good' | 'possible' | 'poor'
  suitability_reason?: string
  sow_months?: number[]
  days_to_harvest_min?: number
  days_to_harvest_max?: number
  sunlight?: string
  water?: string
  soil?: string
  spacing?: string
  fertiliser?: string
  steps?: { title: string; detail: string }[]
  climate_risks?: string[]
  pests_diseases?: string[]
  local_tips?: string[]
}

export interface GuideResult {
  guide: Guide
  climate: MonthNormal[]
  cached: boolean
}

export const QUICK_PICKS = ['Tomato', 'Chilli', 'Okra', 'Brinjal', 'Groundnut', 'Cotton', 'Paddy', 'Maize', 'Mango', 'Marigold']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** [11, 12, 1] → "Nov–Jan"; [3, 6, 7] → "Mar, Jun–Jul". */
export function monthRanges(months: number[]): string {
  const set = new Set(months.filter((m) => m >= 1 && m <= 12))
  if (!set.size) return '—'
  if (set.size === 12) return 'All year'
  // Start each run at a month whose previous month isn't included, so runs can wrap past December.
  const runs: number[][] = []
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue
    const run = [m]
    let next = m === 12 ? 1 : m + 1
    while (set.has(next)) {
      run.push(next)
      next = next === 12 ? 1 : next + 1
    }
    runs.push(run)
  }
  return runs.map((r) => (r.length === 1 ? MONTHS[r[0] - 1] : `${MONTHS[r[0] - 1]}–${MONTHS[r[r.length - 1] - 1]}`)).join(', ')
}

const PLANT = /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u

export function isPlantName(name: string): boolean {
  const n = name.trim()
  return n.length >= 2 && n.length <= 40 && PLANT.test(n)
}

/** A place string the API accepts: letters and simple separators only, else "my area". */
export function placeForPrompt(r: Region): string {
  const joined = [r.placeName, r.admin1, r.country].filter(Boolean).join(', ')
  return /\d/.test(joined) ? 'my area' : joined.replace(/[^\p{L} ,'.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'my area'
}

import type { Hour } from './risk'

export interface Region {
  placeName: string
  admin1: string | null
  country: string | null
  lat: number
  lon: number
  timezone: string | null
}

export interface Forecast {
  now: { time: string; temp: number; rh: number; rain: number; wind: number; code: number }
  days: { date: string; max: number; min: number; rain: number; code: number }[]
  hours: Hour[]
  fetchedAt: string
}

export interface MonthNormal {
  month: number
  temp: number | null
  rain: number
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function parseForecast(json: Json, fetchedAt = new Date().toISOString()): Forecast {
  const c = json.current
  const h = json.hourly
  const d = json.daily
  const hours: Hour[] = []
  for (let i = 0; i < h.time.length && hours.length < 72; i++) {
    if (h.time[i] < c.time) continue
    hours.push({ time: h.time[i], temp: h.temperature_2m[i], rh: h.relative_humidity_2m[i], rain: h.precipitation[i] ?? 0, wind: h.wind_speed_10m[i] })
  }
  return {
    now: { time: c.time, temp: c.temperature_2m, rh: c.relative_humidity_2m, rain: c.precipitation ?? 0, wind: c.wind_speed_10m, code: c.weather_code },
    days: d.time.map((date: string, i: number) => ({
      date,
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      rain: d.precipitation_sum[i] ?? 0,
      code: d.weather_code[i],
    })),
    hours,
    fetchedAt,
  }
}

/** Mean temperature per calendar month, and mean total rain per month per year. */
export function monthlyNormals(json: Json): MonthNormal[] {
  const temps: number[][] = Array.from({ length: 12 }, () => [])
  const rain: Map<string, number>[] = Array.from({ length: 12 }, () => new Map())
  const d = json.daily
  d.time.forEach((day: string, i: number) => {
    const m = Number(day.slice(5, 7)) - 1
    const year = day.slice(0, 4)
    if (d.temperature_2m_mean[i] != null) temps[m].push(d.temperature_2m_mean[i])
    rain[m].set(year, (rain[m].get(year) ?? 0) + (d.precipitation_sum[i] ?? 0))
  })
  return temps.map((t, m) => {
    const years = [...rain[m].values()]
    return {
      month: m + 1,
      temp: t.length ? Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 10) / 10 : null,
      rain: years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : 0,
    }
  })
}

// ── fetching with cache (memory + localStorage; storage may be unavailable) ──

const memory = new Map<string, { at: number; value: unknown }>()

function readCache<T>(key: string, maxAgeMs: number): { value: T; fresh: boolean } | null {
  let hit = memory.get(key)
  if (!hit) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) hit = JSON.parse(raw)
    } catch {
      /* storage unavailable */
    }
  }
  return hit ? { value: hit.value as T, fresh: Date.now() - hit.at < maxAgeMs } : null
}

function writeCache(key: string, value: unknown) {
  const entry = { at: Date.now(), value }
  memory.set(key, entry)
  try {
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    /* storage unavailable or full */
  }
}

async function cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
  const hit = readCache<T>(key, maxAgeMs)
  if (hit?.fresh) return hit.value
  try {
    const value = await load()
    writeCache(key, value)
    return value
  } catch (e) {
    if (hit) return hit.value // offline: serve stale, the caller shows its "as of" time
    throw e
  }
}

const place = (r: Region) => `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`

export function fetchForecast(r: Region): Promise<Forecast> {
  return cached(`agribot.fc.${place(r)}`, 30 * 60_000, async () => {
    const q = new URLSearchParams({
      latitude: String(r.lat),
      longitude: String(r.lon),
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
      hourly: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
      forecast_days: '4',
      timezone: 'auto',
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)
    if (!res.ok) throw new Error(`Weather service returned ${res.status}`)
    const f = parseForecast(await res.json())
    // Four days, so the cards cover the whole 72-hour window the disease risks look at.
    return { ...f, days: f.days.slice(0, 4) }
  })
}

export function fetchClimate(r: Region): Promise<MonthNormal[]> {
  return cached(`agribot.climate.${place(r)}`, 30 * 86_400_000, async () => {
    const end = new Date().getFullYear() - 1
    const q = new URLSearchParams({
      latitude: String(r.lat),
      longitude: String(r.lon),
      start_date: `${end - 9}-01-01`,
      end_date: `${end}-12-31`,
      daily: 'temperature_2m_mean,precipitation_sum',
      timezone: 'auto',
    })
    const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`)
    if (!res.ok) throw new Error(`Climate service returned ${res.status}`)
    return monthlyNormals(await res.json())
  })
}

/** WMO weather code → short words. */
export function describeCode(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  return 'Thunderstorm'
}

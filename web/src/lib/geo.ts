import type { Region } from './weather'

/** Place search via Open-Meteo geocoding (free, no key). */
export async function searchPlaces(query: string): Promise<Region[]> {
  const q = new URLSearchParams({ name: query.trim(), count: '6', language: 'en', format: 'json' })
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`)
  if (!res.ok) throw new Error(`Place search returned ${res.status}`)
  const data = (await res.json()) as { results?: Record<string, string | number>[] }
  return (data.results ?? []).map((r) => ({
    placeName: String(r.name),
    admin1: (r.admin1 as string) ?? null,
    country: (r.country as string) ?? null,
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    timezone: (r.timezone as string) ?? null,
  }))
}

export function coordLabel(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
}

/** Region for a GPS fix, named via OpenStreetMap's reverse lookup when it answers. */
export async function regionFromCoords(lat: number, lon: number): Promise<Region> {
  const base: Region = { placeName: coordLabel(lat, lon), admin1: null, country: null, lat, lon, timezone: null }
  try {
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '12' })
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${q}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return base
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {}
    const name = a.village ?? a.town ?? a.city ?? a.suburb ?? a.county
    return name ? { ...base, placeName: name, admin1: a.state ?? null, country: a.country ?? null } : base
  } catch {
    return base
  }
}

export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This browser has no location access.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was denied. Search for your town instead.' : 'Could not get your location.')),
      { timeout: 15_000, maximumAge: 600_000 },
    )
  })
}

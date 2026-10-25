import { useCallback, useEffect, useState } from 'react'
import type { DataSource } from '../data/types'
import { fetchClimate, fetchForecast, type Forecast, type MonthNormal, type Region } from '../lib/weather'

export interface RegionModel {
  region: Region | null | undefined // undefined while loading, null when not set
  forecast: Forecast | null
  climate: MonthNormal[] | null
  error: string | null
  save(r: Region): Promise<void>
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useRegion(source: DataSource): RegionModel {
  const [region, setRegion] = useState<Region | null | undefined>(undefined)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [climate, setClimate] = useState<MonthNormal[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    source.getRegion().then(setRegion, (e) => {
      setRegion(null)
      setError(message(e))
    })
  }, [source])

  useEffect(() => {
    if (!region) return
    let live = true
    const refresh = () =>
      fetchForecast(region).then(
        (f) => {
          if (!live) return
          setForecast(f)
          setError(null)
        },
        (e) => live && setError(`Weather unavailable right now (${message(e)}).`),
      )
    void refresh()
    fetchClimate(region).then((c) => live && setClimate(c), () => {})
    const timer = setInterval(refresh, 30 * 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [region])

  const save = useCallback(
    async (r: Region) => {
      setError(null)
      try {
        await source.saveRegion(r)
        setForecast(null)
        setClimate(null)
        setRegion(r)
      } catch (e) {
        setError(message(e))
      }
    },
    [source],
  )

  return { region, forecast, climate, error, save }
}

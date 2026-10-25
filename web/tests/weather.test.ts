import { describe, expect, it } from 'vitest'
import { monthlyNormals, parseForecast } from '../src/lib/weather'

const forecastJson = {
  current: { time: '2026-11-01T09:00', temperature_2m: 29.4, relative_humidity_2m: 41, precipitation: 0, wind_speed_10m: 7.2, weather_code: 1 },
  hourly: {
    time: ['2026-11-01T08:00', '2026-11-01T09:00', '2026-11-01T10:00', '2026-11-01T11:00'],
    temperature_2m: [27, 29.4, 30.1, 31],
    relative_humidity_2m: [50, 41, 38, 35],
    precipitation: [0, 0, 0.3, 0],
    wind_speed_10m: [5, 7.2, 8, 9],
  },
  daily: {
    time: ['2026-11-01', '2026-11-02', '2026-11-03'],
    temperature_2m_max: [32, 31, 30],
    temperature_2m_min: [19, 20, 21],
    precipitation_sum: [0, 4.2, 0],
    weather_code: [1, 61, 2],
  },
}

describe('parseForecast', () => {
  it('reads current, daily, and hourly from now onwards', () => {
    const f = parseForecast(forecastJson)
    expect(f.now).toMatchObject({ temp: 29.4, rh: 41, rain: 0, wind: 7.2, code: 1 })
    expect(f.days).toHaveLength(3)
    expect(f.days[1]).toMatchObject({ date: '2026-11-02', max: 31, min: 20, rain: 4.2, code: 61 })
    expect(f.hours.map((h) => h.time)).toEqual(['2026-11-01T09:00', '2026-11-01T10:00', '2026-11-01T11:00'])
    expect(f.hours[1]).toEqual({ time: '2026-11-01T10:00', temp: 30.1, rh: 38, rain: 0.3, wind: 8 })
  })
})

describe('monthlyNormals', () => {
  it('averages temperature per month and rain per month per year', () => {
    const json = {
      daily: {
        time: ['2023-01-01', '2023-01-02', '2024-01-01', '2023-07-01', '2024-07-01'],
        temperature_2m_mean: [20, 22, 24, 28, 26],
        precipitation_sum: [1, 0, 3, 100, 200],
      },
    }
    const n = monthlyNormals(json)
    expect(n).toHaveLength(12)
    expect(n[0]).toEqual({ month: 1, temp: 22, rain: 2 })
    expect(n[6]).toEqual({ month: 7, temp: 27, rain: 150 })
    expect(n[3]).toEqual({ month: 4, temp: null, rain: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { diseaseRisks, sprayWindow, type Hour } from '../src/lib/risk'

const hour = (over: Partial<Hour> = {}): Hour => ({ time: '2026-11-01T09:00', temp: 22, rh: 60, rain: 0, wind: 5, ...over })
const hours = (n: number, over: Partial<Hour>, rest: Partial<Hour> = {}) => [
  ...Array.from({ length: n }, () => hour(over)),
  ...Array.from({ length: 72 - n }, () => hour(rest)),
]
const level = (h: Hour[], label: string) => diseaseRisks(h).find((r) => r.label === label)?.level ?? 'low'

describe('diseaseRisks', () => {
  it('late blight: humid 10–25 °C hours, medium at 4, high at 10', () => {
    expect(level(hours(3, { rh: 95, temp: 18 }), 'late_blight')).toBe('low')
    expect(level(hours(4, { rh: 95, temp: 18 }), 'late_blight')).toBe('medium')
    expect(level(hours(10, { rh: 92, temp: 12 }), 'late_blight')).toBe('high')
    expect(level(hours(20, { rh: 95, temp: 27 }), 'late_blight')).toBe('low')
  })

  it('early blight: warm and wet', () => {
    expect(level(hours(3, { temp: 26, rain: 0.2 }), 'early_blight')).toBe('medium')
    expect(level(hours(8, { temp: 28, rh: 93 }), 'early_blight')).toBe('high')
  })

  it('septoria and bacterial spot need rain', () => {
    expect(level(hours(6, { temp: 22, rain: 1 }), 'septoria_leaf_spot')).toBe('high')
    expect(level(hours(2, { temp: 27, rain: 0.5 }), 'bacterial_spot')).toBe('medium')
    expect(level(hours(10, { temp: 27, rain: 0.4 }), 'bacterial_spot')).toBe('low')
  })

  it('leaf mold: humid 21–24 °C', () => {
    expect(level(hours(12, { rh: 88, temp: 22 }), 'leaf_mold')).toBe('high')
  })

  it('spider mites: hot and dry', () => {
    expect(level(hours(4, { temp: 31, rh: 35 }), 'spider_mites')).toBe('medium')
    expect(level(hours(12, { temp: 33, rh: 30 }), 'spider_mites')).toBe('high')
  })

  it('shows only medium/high, highest first, at most three', () => {
    const mixed = [
      ...Array.from({ length: 12 }, () => hour({ temp: 33, rh: 30 })), // spider mites high
      ...Array.from({ length: 6 }, () => hour({ temp: 22, rain: 1 })), // septoria high
      ...Array.from({ length: 4 }, () => hour({ temp: 18, rh: 95 })), // late blight medium
      ...Array.from({ length: 3 }, () => hour({ temp: 26, rain: 0.2 })), // early blight medium
    ]
    const risks = diseaseRisks(mixed)
    expect(risks).toHaveLength(3)
    expect(risks.map((r) => r.level)).toEqual(['high', 'high', 'medium'])
    expect(risks.every((r) => r.reason.length > 10)).toBe(true)
  })

  it('says when the risky weather starts', () => {
    const h = [hour({ time: '2026-11-01T09:00' }), ...Array.from({ length: 6 }, (_, i) => hour({ time: `2026-11-03T0${i + 4}:00`, temp: 22, rain: 1 }))]
    expect(diseaseRisks(h).find((r) => r.label === 'septoria_leaf_spot')?.startsAt).toBe('2026-11-03T04:00')
  })

  it('returns nothing on calm weather', () => {
    expect(diseaseRisks(hours(0, {}))).toEqual([])
  })
})

describe('sprayWindow', () => {
  it('rain in the next 24 h wins over everything', () => {
    const h = [hour({ wind: 25, temp: 35 }), ...Array.from({ length: 5 }, () => hour()), hour({ rain: 2 })]
    const w = sprayWindow(h)
    expect(w.kind).toBe('rain')
    expect(w.message).toContain('6 h')
  })

  it('ignores rain after 24 h', () => {
    const h = [hour(), ...Array.from({ length: 30 }, () => hour()), hour({ rain: 5 })]
    expect(sprayWindow(h).kind).toBe('good')
  })

  it('then wind, then heat, then good', () => {
    expect(sprayWindow([hour({ wind: 18, temp: 35 })]).kind).toBe('wind')
    expect(sprayWindow([hour({ temp: 33 })]).kind).toBe('heat')
    expect(sprayWindow([hour()]).kind).toBe('good')
  })
})

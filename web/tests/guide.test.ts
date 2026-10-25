import { describe, expect, it } from 'vitest'
import { isPlantName, monthRanges, placeForPrompt } from '../src/lib/guide'

describe('monthRanges', () => {
  it('joins consecutive months, including across the new year', () => {
    expect(monthRanges([10, 11])).toBe('Oct–Nov')
    expect(monthRanges([11, 12, 1, 2])).toBe('Nov–Feb')
    expect(monthRanges([3, 6, 7])).toBe('Mar, Jun–Jul')
    expect(monthRanges([5])).toBe('May')
    expect(monthRanges([])).toBe('—')
  })
})

describe('isPlantName', () => {
  it('accepts plain names and rejects anything that looks like instructions or code', () => {
    for (const ok of ['tomato', 'Bell pepper', "lady's finger", 'pak-choi']) expect(isPlantName(ok)).toBe(true)
    for (const bad of ['x', 'tomato; drop', 'a\nb', '<b>', '42', 'a'.repeat(41)]) expect(isPlantName(bad)).toBe(false)
  })
})

describe('placeForPrompt', () => {
  it('keeps a named place and falls back when the place is only coordinates', () => {
    expect(placeForPrompt({ placeName: 'Warangal', admin1: 'Telangana', country: 'India', lat: 17.97, lon: 79.59, timezone: null })).toBe('Warangal, Telangana, India')
    expect(placeForPrompt({ placeName: '17.97°N, 79.59°E', admin1: null, country: null, lat: 17.97, lon: 79.59, timezone: null })).toBe('my area')
  })
})

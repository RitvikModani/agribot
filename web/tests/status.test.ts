import { describe, expect, it } from 'vitest'
import { ACTIVE_INGREDIENTS, LABELS, LABEL_NAME, REMEDY, mapsSearchUrl } from '../src/lib/labels'
import { captureRequestStatus, confidenceBlocks, isOnline, relativeTime, verdictView } from '../src/lib/status'

const NOW = Date.parse('2026-11-01T09:00:00Z')
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()

describe('isOnline', () => {
  it('is online when seen within 10 s', () => {
    expect(isOnline(ago(9), NOW)).toBe(true)
    expect(isOnline(ago(10), NOW)).toBe(false)
    expect(isOnline(null, NOW)).toBe(false)
  })
})

describe('captureRequestStatus', () => {
  it('goes idle → pending → stalled at 15 s', () => {
    expect(captureRequestStatus(null, NOW)).toBe('idle')
    expect(captureRequestStatus(ago(14), NOW)).toBe('pending')
    expect(captureRequestStatus(ago(15), NOW)).toBe('stalled')
  })
})

describe('verdictView', () => {
  it('never shows a disease or remedy for a frame with no leaf', () => {
    const v = verdictView({ verdict: 'no_leaf', label: 'late_blight', confidence: 0.97 })
    expect(v.tone).toBe('none')
    expect(v.headline).toBe('No leaf in frame')
    expect(v.showRemedy).toBe(false)
    expect(v.detail).not.toContain('Late Blight')
  })

  it('withholds the remedy when uncertain but names the best guess', () => {
    const v = verdictView({ verdict: 'uncertain', label: 'early_blight', confidence: 0.41 })
    expect(v.tone).toBe('uncertain')
    expect(v.showRemedy).toBe(false)
    expect(v.detail).toContain('Early Blight at 41%')
  })

  it('treats healthy and disease differently', () => {
    expect(verdictView({ verdict: 'confident', label: 'healthy', confidence: 0.99 }).tone).toBe('healthy')
    const d = verdictView({ verdict: 'confident', label: 'target_spot', confidence: 0.9 })
    expect(d).toMatchObject({ tone: 'disease', headline: 'Target Spot', showRemedy: true })
  })
})

describe('confidenceBlocks', () => {
  it('rounds to 10 blocks and clamps', () => {
    expect(confidenceBlocks(0.86)).toBe(9)
    expect(confidenceBlocks(0.04)).toBe(0)
    expect(confidenceBlocks(1.2)).toBe(10)
  })
})

describe('relativeTime', () => {
  it('formats short spans', () => {
    expect(relativeTime(null, NOW)).toBe('never')
    expect(relativeTime(ago(2), NOW)).toBe('just now')
    expect(relativeTime(ago(42), NOW)).toBe('42s ago')
    expect(relativeTime(ago(150), NOW)).toBe('2m ago')
    expect(relativeTime(ago(7300), NOW)).toBe('2h ago')
  })
})

describe('remedy shopping', () => {
  it('names active ingredients for every disease and none for healthy', () => {
    for (const key of LABELS) expect(ACTIVE_INGREDIENTS[key].length > 0).toBe(key !== 'healthy')
    expect(ACTIVE_INGREDIENTS.late_blight).toContain('mancozeb')
  })

  it('builds a Google Maps search for the first ingredient near the place', () => {
    const url = new URL(mapsSearchUrl('late_blight', 'Warangal'))
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('query')).toBe('mancozeb pesticide shop near Warangal')
  })
})

describe('labels', () => {
  it('has a name and a remedy for every model label', () => {
    expect(LABELS).toHaveLength(10)
    for (const key of LABELS) {
      expect(LABEL_NAME[key]).toBeTruthy()
      expect(REMEDY[key].length).toBeGreaterThan(20)
    }
  })
})

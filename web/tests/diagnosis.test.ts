import { describe, expect, it } from 'vitest'
import type { Capture } from '../src/data/types'
import { boxStyle, headline, ingredientMapsUrl, isTomato, type Diagnosis, type Finding } from '../src/lib/diagnosis'

const finding = (problem: string, severity: Finding['severity']): Finding => ({
  problem, kind: 'disease', severity, box_2d: [100, 200, 600, 900], advice: 'Spray.', active_ingredient: 'mancozeb',
})
const dx = (over: Partial<Diagnosis> = {}): Diagnosis => ({
  plant_present: true, common_name: 'Chilli', scientific_name: 'Capsicum annuum', health: 'diseased',
  summary: '', findings: [finding('Leaf spot', 'mild'), finding('Leaf curl virus', 'severe')], ...over,
})
const capture = (over: Partial<Capture> = {}): Capture => ({
  id: 'c1', deviceId: 'd1', createdAt: '2026-10-28T10:00:00Z', imagePath: 'p.jpg', label: 'early_blight',
  confidence: 0.9, verdict: 'confident', leafFraction: 0.5, top3: [], modelVersion: 'tomato-tm-v1', plantTag: null,
  aiStatus: 'skipped', ai: null, aiModel: null, ...over,
})

describe('headline', () => {
  it('names the crop and its worst finding when Gemini is done', () => {
    expect(headline(capture({ aiStatus: 'done', ai: dx() }))).toMatchObject({ text: 'Chilli · Leaf curl virus', tone: 'disease', source: 'ai', crop: 'Chilli' })
  })
  it('says healthy, unclear and no plant', () => {
    expect(headline(capture({ aiStatus: 'done', ai: dx({ health: 'healthy', findings: [] }) })).text).toBe('Chilli · Healthy')
    expect(headline(capture({ aiStatus: 'done', ai: dx({ health: 'unclear', findings: [] }) })).text).toBe('Chilli · Unclear, retake')
    expect(headline(capture({ aiStatus: 'done', ai: dx({ plant_present: false, findings: [] }) }))).toMatchObject({ text: 'No plant in frame', tone: 'none' })
  })
  it('falls back to the tomato model while pending, with a note', () => {
    expect(headline(capture({ aiStatus: 'pending' }))).toMatchObject({ text: 'Early Blight', source: 'model', note: 'Reading the whole plant…' })
  })
  it('explains a failure but stays quiet when skipped', () => {
    expect(headline(capture({ aiStatus: 'failed', ai: { reason: 'Gemini quota hit.' } })).note).toBe('Whole-plant check unavailable: Gemini quota hit.')
    expect(headline(capture({ aiStatus: 'skipped' })).note).toBeNull()
  })
})

describe('boxStyle', () => {
  it('turns 0-1000 boxes into percentages', () => {
    expect(boxStyle([100, 200, 600, 900])).toEqual({ top: '10%', left: '20%', height: '50%', width: '70%' })
  })
  it('clamps out-of-range values', () => {
    expect(boxStyle([-50, -10, 1200, 1100])).toEqual({ top: '0%', left: '0%', height: '100%', width: '100%' })
  })
})

describe('isTomato and maps', () => {
  it('matches tomato in any case, only once Gemini is done', () => {
    expect(isTomato(capture({ aiStatus: 'done', ai: dx({ common_name: 'Cherry TOMATO' }) }))).toBe(true)
    expect(isTomato(capture({ aiStatus: 'done', ai: dx() }))).toBe(false)
    expect(isTomato(capture({ aiStatus: 'pending' }))).toBe(false)
  })
  it('builds a Google Maps search for the ingredient', () => {
    const url = new URL(ingredientMapsUrl('mancozeb', 'Kazipet'))
    expect(url.hostname).toBe('www.google.com')
    expect(url.searchParams.get('query')).toBe('mancozeb pesticide shop near Kazipet')
  })
})

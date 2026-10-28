import { describe, expect, it } from 'vitest'
import { captureSteps } from '../src/lib/steps'

const states = (s: ReturnType<typeof captureSteps>) => s.map((x) => x.state)
const sick = { verdict: 'confident' as const, label: 'early_blight' as const, confidence: 0.9 }

describe('captureSteps', () => {
  it('is all to-do before the first capture', () => {
    expect(states(captureSteps('idle'))).toEqual(['todo', 'todo', 'todo', 'todo'])
    expect(states(captureSteps('stalled'))).toEqual(['todo', 'todo', 'todo', 'todo'])
  })
  it('shows diagnosis in progress while a capture is in flight, even over an old capture', () => {
    expect(states(captureSteps('pending'))).toEqual(['done', 'active', 'todo', 'todo'])
    expect(states(captureSteps('pending', sick))).toEqual(['done', 'active', 'todo', 'todo'])
  })
  it('opens Treat and Buy for a confident disease', () => {
    expect(states(captureSteps('idle', sick))).toEqual(['done', 'done', 'active', 'active'])
  })
  it('mutes Treat and Buy for a healthy leaf', () => {
    const s = captureSteps('idle', { verdict: 'confident', label: 'healthy', confidence: 0.95 })
    expect(states(s)).toEqual(['done', 'done', 'muted', 'muted'])
    expect(s[2].note).toBe('Nothing to treat')
  })
  it('asks for a retake when unsure or when there is no leaf', () => {
    for (const verdict of ['uncertain', 'no_leaf'] as const) {
      const s = captureSteps('idle', { verdict, label: 'late_blight', confidence: 0.4 })
      expect(states(s)).toEqual(['done', 'done', 'muted', 'muted'])
      expect(s[3].note).toBe('Retake')
    }
  })
  it('follows the whole-plant diagnosis once Gemini is done', () => {
    const base = { verdict: 'confident' as const, label: 'healthy' as const, confidence: 0.9, aiStatus: 'done' as const }
    const dx = { plant_present: true, common_name: 'Chilli', scientific_name: '', health: 'diseased' as const, summary: '' }
    const curl = { problem: 'Leaf curl', kind: 'disease' as const, severity: 'severe' as const, box_2d: null, advice: 'Spray.', active_ingredient: 'imidacloprid' }
    expect(states(captureSteps('idle', { ...base, ai: { ...dx, findings: [curl] } }))).toEqual(['done', 'done', 'active', 'active'])
    const noShop = captureSteps('idle', { ...base, ai: { ...dx, findings: [{ ...curl, active_ingredient: '' }] } })
    expect(states(noShop)).toEqual(['done', 'done', 'active', 'muted'])
    expect(noShop[3].note).toBe('Nothing to buy')
    expect(captureSteps('idle', { ...base, ai: { ...dx, health: 'healthy', findings: [] } })[2].note).toBe('Nothing to treat')
    expect(captureSteps('idle', { ...base, ai: { ...dx, plant_present: false, findings: [] } })[2].note).toBe('Retake')
  })
  it('numbers the steps 01 to 04', () => {
    expect(captureSteps('idle').map((s) => `${s.n} ${s.label}`)).toEqual(['01 Capture', '02 Diagnose', '03 Treat', '04 Buy'])
  })
})

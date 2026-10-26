import { ACTIVE_INGREDIENTS, type LabelKey } from './labels'
import { verdictView, type RequestStatus, type Verdict } from './status'

export type StepState = 'done' | 'active' | 'todo' | 'muted'
export interface Step {
  n: string
  label: 'Capture' | 'Diagnose' | 'Treat' | 'Buy'
  state: StepState
  note?: string
}

const step = (n: string, label: Step['label'], state: StepState, note?: string): Step => ({ n, label, state, note })

/** Where the latest capture is in Capture → Diagnose → Treat → Buy. */
export function captureSteps(request: RequestStatus, capture?: { verdict: Verdict; label: LabelKey; confidence: number }): Step[] {
  if (request === 'pending') return [step('01', 'Capture', 'done'), step('02', 'Diagnose', 'active'), step('03', 'Treat', 'todo'), step('04', 'Buy', 'todo')]
  if (!capture) return [step('01', 'Capture', 'todo'), step('02', 'Diagnose', 'todo'), step('03', 'Treat', 'todo'), step('04', 'Buy', 'todo')]
  const seen = [step('01', 'Capture', 'done'), step('02', 'Diagnose', 'done')]
  const tone = verdictView(capture).tone
  if (tone === 'disease') {
    const buy = ACTIVE_INGREDIENTS[capture.label].length ? step('04', 'Buy', 'active') : step('04', 'Buy', 'muted', 'Nothing to buy')
    return [...seen, step('03', 'Treat', 'active'), buy]
  }
  const note = tone === 'healthy' ? 'Nothing to treat' : 'Retake'
  return [...seen, step('03', 'Treat', 'muted', note), step('04', 'Buy', 'muted', note)]
}

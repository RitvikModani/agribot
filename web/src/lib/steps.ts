import { diagnosisOf, type AiResult, type AiStatus } from './diagnosis'
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
export function captureSteps(
  request: RequestStatus,
  capture?: { verdict: Verdict; label: LabelKey; confidence: number; aiStatus?: AiStatus; ai?: AiResult },
): Step[] {
  if (request === 'pending') return [step('01', 'Capture', 'done'), step('02', 'Diagnose', 'active'), step('03', 'Treat', 'todo'), step('04', 'Buy', 'todo')]
  if (!capture) return [step('01', 'Capture', 'todo'), step('02', 'Diagnose', 'todo'), step('03', 'Treat', 'todo'), step('04', 'Buy', 'todo')]
  const seen = [step('01', 'Capture', 'done'), step('02', 'Diagnose', 'done')]
  const dx = diagnosisOf(capture)
  if (dx) {
    // The whole-plant diagnosis, once in, decides what there is to treat and buy.
    if (!dx.plant_present) return [...seen, step('03', 'Treat', 'muted', 'Retake'), step('04', 'Buy', 'muted', 'Retake')]
    const treatable = dx.findings.filter((f) => f.advice)
    if (!treatable.length) return [...seen, step('03', 'Treat', 'muted', 'Nothing to treat'), step('04', 'Buy', 'muted', 'Nothing to treat')]
    const buy = treatable.some((f) => f.active_ingredient) ? step('04', 'Buy', 'active') : step('04', 'Buy', 'muted', 'Nothing to buy')
    return [...seen, step('03', 'Treat', 'active'), buy]
  }
  const tone = verdictView(capture).tone
  if (tone === 'disease') {
    const buy = ACTIVE_INGREDIENTS[capture.label].length ? step('04', 'Buy', 'active') : step('04', 'Buy', 'muted', 'Nothing to buy')
    return [...seen, step('03', 'Treat', 'active'), buy]
  }
  const note = tone === 'healthy' ? 'Nothing to treat' : 'Retake'
  return [...seen, step('03', 'Treat', 'muted', note), step('04', 'Buy', 'muted', note)]
}

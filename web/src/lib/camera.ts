// Camera exposure is a 5-step target: the camera's auto-exposure aims darker or brighter.
export const EXPOSURE_MIN = -2
export const EXPOSURE_MAX = 2

const LABELS = ['Much darker', 'Darker', 'Normal', 'Brighter', 'Much brighter']

export const stepExposure = (current: number, delta: number) =>
  Math.min(EXPOSURE_MAX, Math.max(EXPOSURE_MIN, current + delta))

export const exposureLabel = (n: number) => LABELS[stepExposure(n, 0) - EXPOSURE_MIN]

export const exposureValue = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

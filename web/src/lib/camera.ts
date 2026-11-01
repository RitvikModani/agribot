// Camera exposure is a 5-step target: the camera's auto-exposure aims darker or brighter.
export const EXPOSURE_MIN = -2
export const EXPOSURE_MAX = 2

const LABELS = ['Much darker', 'Darker', 'Normal', 'Brighter', 'Much brighter']

export const stepExposure = (current: number, delta: number) =>
  Math.min(EXPOSURE_MAX, Math.max(EXPOSURE_MIN, current + delta))

export const exposureLabel = (n: number) => LABELS[stepExposure(n, 0) - EXPOSURE_MIN]

export const exposureValue = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** The camera's own live-video page, reachable only from devices on the same hotspot (private IPv4 only). */
export function liveVideoUrl(ip: string | null): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip ?? '')
  if (!m) return null
  const [a, b, c, d] = m.slice(1).map(Number)
  if ([a, b, c, d].some((n) => n > 255)) return null
  const hotspot = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  return hotspot ? `http://${ip}/` : null
}

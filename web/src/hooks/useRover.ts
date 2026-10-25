import { useCallback, useEffect, useState } from 'react'
import type { Capture, ControlPatch, DataSource, Rover } from '../data/types'

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export interface RoverModel {
  rover: Rover | null | undefined // undefined while loading, null when no rover exists yet
  captures: Capture[]
  error: string | null
  reload(): Promise<void>
  requestCapture(): Promise<void>
  updateControls(patch: ControlPatch): Promise<void>
  removeCapture(c: Capture): Promise<void>
  appendOlder(): Promise<boolean>
}

export function useRover(source: DataSource): RoverModel {
  const [rover, setRover] = useState<Rover | null | undefined>(undefined)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      setError(null)
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const reload = useCallback(
    () =>
      run(async () => {
        const [r, list] = await Promise.all([source.getRover(), source.listCaptures({ limit: 24 })])
        setRover(r)
        setCaptures(list)
      }),
    [run, source],
  )

  useEffect(() => {
    void reload()
    return source.subscribe({
      onCapture: (c) => setCaptures((prev) => (prev.some((p) => p.id === c.id) ? prev : [c, ...prev])),
      onDevice: (d) => setRover((r) => (r && r.device.id === d.id ? { ...r, device: d } : r)),
      onState: (s) => setRover((r) => (r && r.state.deviceId === s.deviceId ? { ...r, state: s } : r)),
    })
  }, [reload, source])

  const deviceId = rover?.device.id

  return {
    rover,
    captures,
    error,
    reload,
    requestCapture: () =>
      run(async () => {
        if (!deviceId) return
        // Optimistic: show "capturing" immediately; realtime confirms or the 15 s stall says otherwise.
        setRover((r) => (r ? { ...r, state: { ...r.state, captureRequestedAt: new Date().toISOString() } } : r))
        await source.requestCapture(deviceId)
      }),
    updateControls: (patch) =>
      run(async () => {
        if (!deviceId) return
        setRover((r) => (r ? { ...r, state: { ...r.state, ...patch } } : r))
        await source.updateControls(deviceId, patch)
      }),
    removeCapture: (c) =>
      run(async () => {
        await source.deleteCapture(c)
        setCaptures((prev) => prev.filter((p) => p.id !== c.id))
      }),
    appendOlder: async () => {
      const last = captures[captures.length - 1]
      if (!last) return false
      const older = await source.listCaptures({ limit: 24, before: last.createdAt })
      setCaptures((prev) => [...prev, ...older.filter((o) => !prev.some((p) => p.id === o.id))])
      return older.length > 0
    },
  }
}

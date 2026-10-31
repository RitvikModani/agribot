import type { ControlPatch } from './types'

const COLUMNS: Record<keyof ControlPatch, string> = {
  patrolOn: 'patrol_on',
  patrolIntervalS: 'patrol_interval_s',
  plantTag: 'plant_tag',
  camExposure: 'cam_exposure',
  camHmirror: 'cam_hmirror',
  camVflip: 'cam_vflip',
}

/** The device_state columns for a dashboard patch; fields left out of the patch stay untouched. */
export function controlRow(patch: ControlPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) row[COLUMNS[key as keyof ControlPatch]] = value
  }
  return row
}

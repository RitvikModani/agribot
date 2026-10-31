import { describe, expect, it } from 'vitest'
import { controlRow } from '../src/data/controls'
import { exposureLabel, exposureValue, stepExposure } from '../src/lib/camera'

describe('stepExposure', () => {
  it('moves one step and stays within -2..+2', () => {
    expect(stepExposure(0, 1)).toBe(1)
    expect(stepExposure(0, -1)).toBe(-1)
    expect(stepExposure(2, 1)).toBe(2)
    expect(stepExposure(-2, -1)).toBe(-2)
  })
})

describe('exposure text', () => {
  it('names every step', () => {
    expect([-2, -1, 0, 1, 2].map(exposureLabel)).toEqual(['Much darker', 'Darker', 'Normal', 'Brighter', 'Much brighter'])
  })
  it('shows a signed value with a real minus sign', () => {
    expect([-2, 0, 1].map(exposureValue)).toEqual(['−2', '0', '+1'])
  })
})

describe('controlRow', () => {
  it('maps only the fields in the patch to device_state columns', () => {
    expect(controlRow({ camExposure: -1 })).toEqual({ cam_exposure: -1 })
    expect(controlRow({ camHmirror: true, camVflip: false })).toEqual({ cam_hmirror: true, cam_vflip: false })
    expect(controlRow({ patrolOn: true, patrolIntervalS: 20, plantTag: null })).toEqual({
      patrol_on: true,
      patrol_interval_s: 20,
      plant_tag: null,
    })
    expect(controlRow({})).toEqual({})
  })
})

import { describe, expect, it } from 'vitest'
import { buildLabel } from '../src/lib/build'

describe('buildLabel', () => {
  it('names a deployed build by its run number and commit', () => {
    expect(buildLabel('58-98cce45f0a1b2c3d4e5f60718293a4b5c6d7e8f9')).toBe('Build 58 · 98cce45')
  })
  it('calls anything else a local build', () => {
    expect([undefined, '', 'dev', '58-'].map(buildLabel)).toEqual(['Local build', 'Local build', 'Local build', 'Local build'])
  })
})

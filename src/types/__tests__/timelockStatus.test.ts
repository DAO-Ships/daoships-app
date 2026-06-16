import { describe, it, expect } from 'vitest'
import { computeTimelockStatus } from '@/types/timelock'

// executable_after=2000 (delay window ends), expires_at=5000 (execution window ends).
const base = { status: 'queued' as const, executable_after: 2000, expires_at: 5000 }

describe('computeTimelockStatus', () => {
  it('stored terminal statuses take precedence over the clock', () => {
    expect(computeTimelockStatus({ ...base, status: 'executed' }, 1)).toBe('executed')
    expect(computeTimelockStatus({ ...base, status: 'cancelled' }, 9999)).toBe('cancelled')
  })
  it('queued during the delay window (second ragequit window)', () => {
    expect(computeTimelockStatus(base, 1999)).toBe('queued')
  })
  it('executable at executable_after (inclusive)', () => {
    expect(computeTimelockStatus(base, 2000)).toBe('executable')
    expect(computeTimelockStatus(base, 5000)).toBe('executable')
  })
  it('expired after expires_at (cancel-only)', () => {
    expect(computeTimelockStatus(base, 5001)).toBe('expired')
  })
})

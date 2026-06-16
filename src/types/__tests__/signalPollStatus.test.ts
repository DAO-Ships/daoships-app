import { describe, it, expect } from 'vitest'
import { computeSignalPollStatus } from '@/types/navigator'

// Time-derived poll status mirrors the contract's pollStatus() with a half-open
// window [voting_starts, voting_ends). `cancelled` is terminal.

describe('computeSignalPollStatus', () => {
  const base = { cancelled: false, voting_starts: 1000, voting_ends: 2000 }

  it('cancelled overrides everything', () => {
    expect(computeSignalPollStatus({ ...base, cancelled: true }, 1500)).toBe('cancelled')
    expect(computeSignalPollStatus({ ...base, cancelled: true }, 500)).toBe('cancelled')
    expect(computeSignalPollStatus({ ...base, cancelled: true }, 5000)).toBe('cancelled')
  })

  it('pending before voting_starts', () => {
    expect(computeSignalPollStatus(base, 999)).toBe('pending')
  })

  it('active at voting_starts (inclusive)', () => {
    expect(computeSignalPollStatus(base, 1000)).toBe('active')
  })

  it('active within the window', () => {
    expect(computeSignalPollStatus(base, 1999)).toBe('active')
  })

  it('ended at voting_ends (exclusive end)', () => {
    expect(computeSignalPollStatus(base, 2000)).toBe('ended')
  })

  it('ended after voting_ends', () => {
    expect(computeSignalPollStatus(base, 9999)).toBe('ended')
  })
})

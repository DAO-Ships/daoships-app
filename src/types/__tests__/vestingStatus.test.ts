import { describe, it, expect } from 'vitest'
import { computeVestingStatus, vestedAmount, claimable } from '@/types/vesting'

// start=1000, cliff_end=2000, vesting_end=5000, total=4000 (linear from start).
// Cliff unlocks the accrued-since-start lump at cliff_end, then continues linearly.
const base = {
  total_amount: '4000',
  claimed: '0',
  is_loot: false,
  start_time: 1000,
  cliff_end: 2000,
  vesting_end: 5000,
  revoked: false,
  revoked_at: null as number | null,
  vested_at_revoke: null as string | null,
}

describe('computeVestingStatus', () => {
  it('revoked overrides everything', () => {
    expect(computeVestingStatus({ ...base, revoked: true }, 500)).toBe('revoked')
    expect(computeVestingStatus({ ...base, revoked: true }, 9999)).toBe('revoked')
  })
  it('pending before the cliff', () => {
    expect(computeVestingStatus(base, 1999)).toBe('pending')
  })
  it('vesting between cliff and end', () => {
    expect(computeVestingStatus(base, 2000)).toBe('vesting')
    expect(computeVestingStatus(base, 4999)).toBe('vesting')
  })
  it('fully_vested at/after vesting_end', () => {
    expect(computeVestingStatus(base, 5000)).toBe('fully_vested')
    expect(computeVestingStatus(base, 9999)).toBe('fully_vested')
  })
})

describe('vestedAmount', () => {
  it('zero before the cliff', () => {
    expect(vestedAmount(base, 1500)).toBe(0n)
  })
  it('lump unlock at the cliff: accrued since start (1000s of 4000s elapsed → 1000)', () => {
    // at t=2000: elapsed 1000/4000 of the curve → 4000 * 1000/4000 = 1000
    expect(vestedAmount(base, 2000)).toBe(1000n)
  })
  it('linear midpoint', () => {
    // at t=3000: elapsed 2000/4000 → 2000
    expect(vestedAmount(base, 3000)).toBe(2000n)
  })
  it('full at/after vesting_end', () => {
    expect(vestedAmount(base, 5000)).toBe(4000n)
    expect(vestedAmount(base, 99999)).toBe(4000n)
  })
  it('revoke freezes accrual at revoked_at', () => {
    const r = { ...base, revoked: true, revoked_at: 3000 }
    // frozen at t=3000 → 2000, regardless of "now"
    expect(vestedAmount(r, 9999)).toBe(2000n)
  })
})

describe('claimable', () => {
  it('is vested minus claimed, clamped at zero', () => {
    expect(claimable({ ...base, claimed: '500' }, 3000)).toBe(1500n) // vested 2000 - 500
    expect(claimable({ ...base, claimed: '2500' }, 3000)).toBe(0n) // claimed > vested
  })
})

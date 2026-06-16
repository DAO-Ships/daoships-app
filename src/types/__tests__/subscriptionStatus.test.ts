import { describe, it, expect } from 'vitest'
import { computeSubscriptionStatus } from '@/types/subscription'

// paid_through = 2000, graceDuration = 500 → grace window is (2000, 2500].
const grace = 500

describe('computeSubscriptionStatus', () => {
  it('not_enrolled when paid_through is 0', () => {
    expect(computeSubscriptionStatus({ paid_through: 0 }, grace, 9999)).toBe('not_enrolled')
  })
  it('current while now <= paid_through (inclusive)', () => {
    expect(computeSubscriptionStatus({ paid_through: 2000 }, grace, 1999)).toBe('current')
    expect(computeSubscriptionStatus({ paid_through: 2000 }, grace, 2000)).toBe('current')
  })
  it('grace while paid_through < now <= paid_through + grace', () => {
    expect(computeSubscriptionStatus({ paid_through: 2000 }, grace, 2001)).toBe('grace')
    expect(computeSubscriptionStatus({ paid_through: 2000 }, grace, 2500)).toBe('grace')
  })
  it('delinquent past the grace window', () => {
    expect(computeSubscriptionStatus({ paid_through: 2000 }, grace, 2501)).toBe('delinquent')
  })
  it('zero grace: delinquent immediately after paid_through', () => {
    expect(computeSubscriptionStatus({ paid_through: 2000 }, 0, 2000)).toBe('current')
    expect(computeSubscriptionStatus({ paid_through: 2000 }, 0, 2001)).toBe('delinquent')
  })
})

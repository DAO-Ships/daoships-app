import { describe, it, expect } from 'vitest'
import { computeBudgetStatus, ceilingRemaining } from '@/types/budget'

// Time-derived budget status mirrors the contract's active window.
// `cancelled` is terminal; ends_at === 0 means perpetual.

describe('computeBudgetStatus', () => {
  const base = { cancelled: false, starts_at: 1000, ends_at: 2000 }

  it('cancelled overrides everything', () => {
    expect(computeBudgetStatus({ ...base, cancelled: true }, 1500)).toBe('cancelled')
    expect(computeBudgetStatus({ ...base, cancelled: true }, 500)).toBe('cancelled')
    expect(computeBudgetStatus({ ...base, cancelled: true }, 5000)).toBe('cancelled')
  })

  it('pending before starts_at', () => {
    expect(computeBudgetStatus(base, 999)).toBe('pending')
  })

  it('active at starts_at (inclusive)', () => {
    expect(computeBudgetStatus(base, 1000)).toBe('active')
  })

  it('active within the window', () => {
    expect(computeBudgetStatus(base, 1999)).toBe('active')
  })

  it('ended at ends_at (inclusive end)', () => {
    expect(computeBudgetStatus(base, 2000)).toBe('ended')
  })

  it('perpetual (ends_at === 0) is active forever after start', () => {
    const perpetual = { cancelled: false, starts_at: 1000, ends_at: 0 }
    expect(computeBudgetStatus(perpetual, 999)).toBe('pending')
    expect(computeBudgetStatus(perpetual, 1000)).toBe('active')
    expect(computeBudgetStatus(perpetual, 10_000_000)).toBe('active')
  })
})

describe('ceilingRemaining', () => {
  it('returns headroom under the ceiling', () => {
    expect(ceilingRemaining({ total_ceiling: '1000', total_spent: '250' })).toBe(750n)
  })

  it('clamps to zero when spent meets or exceeds the ceiling', () => {
    expect(ceilingRemaining({ total_ceiling: '1000', total_spent: '1000' })).toBe(0n)
    expect(ceilingRemaining({ total_ceiling: '1000', total_spent: '1500' })).toBe(0n)
  })

  it('handles large NUMERIC(78,0) string values without precision loss', () => {
    const ceiling = '1000000000000000000000000' // 1e24 wei
    const spent = '999999999999999999999999'
    expect(ceilingRemaining({ total_ceiling: ceiling, total_spent: spent })).toBe(1n)
  })
})

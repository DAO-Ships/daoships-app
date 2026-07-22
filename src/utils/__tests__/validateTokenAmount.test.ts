import { describe, it, expect } from 'vitest'
import { validateTokenAmount } from '../validation'
import { parseTokenAmount } from '../format'

// ═══════════════════════════════════════════════════════════════════════════
// The launch wizard's `trigger()` was a no-op on proposalOffering,
// sponsorThreshold, members.*.shares and members.*.loot — all four were registered
// with NO rules — so raw strings reached parseTokenAmount. The throw surfaced AFTER
// salt mining and after navigator deploys had been paid for; the silent-zero cases
// succeeded and produced a founding member holding nothing.
// ═══════════════════════════════════════════════════════════════════════════

describe('validateTokenAmount rejects what parseTokenAmount throws on', () => {
  it.each([
    ['1,000', 'thousands separator'],
    ['abc', 'letters'],
    ['1e3', 'scientific notation'],
    ['-5', 'negative'],
    ['1.2.3', 'malformed decimal'],
  ])('rejects %s (%s)', (input) => {
    // Each of these throws inside the launch pipeline today.
    expect(() => parseTokenAmount(input)).toThrow()
    expect(validateTokenAmount(input)).not.toBe(true)
  })
})

describe('validateTokenAmount catches silent-zero inputs', () => {
  it('rejects sub-wei precision that would mint zero shares', () => {
    // parseTokenAmount silently returns 0n — a founding member with no shares.
    expect(parseTokenAmount('0.0000000000000000001')).toBe(0n)
    expect(validateTokenAmount('0.0000000000000000001', { allowZero: false }))
      .not.toBe(true)
  })

  it('rejects more than 18 decimal places outright', () => {
    expect(validateTokenAmount('1.0000000000000000001')).not.toBe(true)
  })

  it('rejects whitespace when a value is required', () => {
    expect(validateTokenAmount('   ', { allowZero: false })).not.toBe(true)
  })
})

describe('validateTokenAmount accepts legitimate input', () => {
  it.each(['0', '1', '100', '1.5', '0.000000000000000001', '1234.56789'])(
    'accepts %s',
    (input) => {
      expect(validateTokenAmount(input)).toBe(true)
      expect(() => parseTokenAmount(input)).not.toThrow()
    },
  )

  it('treats an empty value as valid when zero is allowed', () => {
    expect(validateTokenAmount('', { allowZero: true })).toBe(true)
  })

  it('names the field in the message so the error is actionable', () => {
    const msg = validateTokenAmount('1,000', { label: 'Shares' })
    expect(typeof msg).toBe('string')
    expect(msg).toContain('Shares')
  })
})

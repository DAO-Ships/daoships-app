import { describe, it, expect } from 'vitest'
import { parseTokenAmount, formatTokenAmount } from '../format'

// ═══════════════════════════════════════════════════════════════════════════
// Token-decimal scaling.
//
// Every read path in the app resolved a token's real decimals; every write path
// defaulted to 18. For a 6-decimal token (USDC/USDT) that overstates the encoded
// amount by 10^12 — and for ERC-20 tribute prices, which are immutable constructor
// args, the mistake is unrecoverable without a governance redeploy.
// ═══════════════════════════════════════════════════════════════════════════

const USDC_DECIMALS = 6
const WAD_DECIMALS = 18

describe('parseTokenAmount decimal scaling', () => {
  it('scales by the token decimals, not a fixed 18', () => {
    expect(parseTokenAmount('1', USDC_DECIMALS)).toBe(1_000_000n)
    expect(parseTokenAmount('1', WAD_DECIMALS)).toBe(10n ** 18n)
  })

  it('quantifies the 1e12 error of assuming 18 for a 6-decimal token', () => {
    const correct = parseTokenAmount('10000', USDC_DECIMALS)
    const assuming18 = parseTokenAmount('10000', WAD_DECIMALS)
    expect(assuming18 / correct).toBe(10n ** 12n)
  })

  it('encodes the contract-documented tribute example correctly', () => {
    // ERC20TributeNavigator.sol: "pricePerShare = 100e6 (100 USDC per whole share)"
    expect(parseTokenAmount('100', USDC_DECIMALS)).toBe(100_000_000n)
  })

  it('defaults to 18 only when no decimals are supplied', () => {
    expect(parseTokenAmount('1')).toBe(10n ** 18n)
  })

  it('round-trips through format at the same decimals', () => {
    const raw = parseTokenAmount('1234.56', USDC_DECIMALS)
    expect(formatTokenAmount(raw, USDC_DECIMALS, 2, 2)).toBe('1234.56')
  })

  it('does not silently truncate sub-unit precision to zero at 6 decimals', () => {
    expect(parseTokenAmount('0.000001', USDC_DECIMALS)).toBe(1n)
  })
})

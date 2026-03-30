import { describe, it, expect } from 'vitest'
import { navigatorService } from '@/services/core/NavigatorService'

describe('calculateERC20TributeCost', () => {
  const calc = navigatorService.calculateERC20TributeCost.bind(navigatorService)
  const ONE = 1000000000000000000n // 1e18

  it('normal case: 1 share at price 1e18 per share costs 1e18', () => {
    expect(calc(ONE, 0n, ONE, 0n)).toBe(ONE)
  })

  it('returns -1n sentinel when share tribute truncates to zero', () => {
    // 1 * 1 / 1e18 = 0 → truncation sentinel
    expect(calc(1n, 0n, 1n, 0n)).toBe(-1n)
  })

  it('zero shares with loot at price 1e18 per loot costs 1e18', () => {
    expect(calc(0n, ONE, 0n, ONE)).toBe(ONE)
  })

  it('both shares and loot zero returns 0n', () => {
    expect(calc(0n, 0n, 0n, 0n)).toBe(0n)
  })

  it('returns -1n sentinel when loot tribute truncates to zero', () => {
    // 0 shares + (1 * 1 / 1e18 = 0) → truncation sentinel for loot
    expect(calc(0n, 1n, 0n, 1n)).toBe(-1n)
  })

  it('handles mixed shares and loot correctly', () => {
    // 2e18 shares at 3e18 price + 1e18 loot at 1e18 price = 6e18 + 1e18 = 7e18
    const twoTokens = 2n * ONE
    const threeTokens = 3n * ONE
    expect(calc(twoTokens, ONE, threeTokens, ONE)).toBe(7n * ONE)
  })

  it('returns -1n even when only one component truncates', () => {
    // shares: 1e18 * 1e18 / 1e18 = 1e18 (fine)
    // loot: 1 * 1 / 1e18 = 0 (truncation)
    expect(calc(ONE, 1n, ONE, 1n)).toBe(-1n)
  })
})

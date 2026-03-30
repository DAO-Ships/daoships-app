import { describe, it, expect } from 'vitest'
import {
  onboarderMultiplierSchema,
  onboarderFixedPriceSchema,
  erc20TributeSchema,
  getNavigatorWarnings,
} from '@/utils/navigatorValidation'

// ═══════════════════════════════════════════════════════════════════════════
// Onboarder Multiplier Mode
// ═══════════════════════════════════════════════════════════════════════════

describe('onboarderMultiplierSchema', () => {
  it('accepts valid config (shareMultiplier=10000, lootMultiplier=0)', () => {
    const result = onboarderMultiplierSchema.safeParse({
      shareMultiplier: 10000,
      lootMultiplier: 0,
      minTribute: '0.1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects shareMultiplier=0', () => {
    const result = onboarderMultiplierSchema.safeParse({
      shareMultiplier: 0,
      lootMultiplier: 0,
      minTribute: '0.1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects shareMultiplier > 1000000', () => {
    const result = onboarderMultiplierSchema.safeParse({
      shareMultiplier: 1000001,
      lootMultiplier: 0,
      minTribute: '0.1',
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Onboarder Fixed-Price Mode
// ═══════════════════════════════════════════════════════════════════════════

describe('onboarderFixedPriceSchema', () => {
  it('accepts valid config', () => {
    const result = onboarderFixedPriceSchema.safeParse({
      pricePerUnit: '1.5',
      sharesPerUnit: 1,
      lootPerUnit: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects pricePerUnit=0', () => {
    const result = onboarderFixedPriceSchema.safeParse({
      pricePerUnit: '0',
      sharesPerUnit: 1,
      lootPerUnit: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects both sharesPerUnit=0 AND lootPerUnit=0', () => {
    const result = onboarderFixedPriceSchema.safeParse({
      pricePerUnit: '1',
      sharesPerUnit: 0,
      lootPerUnit: 0,
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ERC20 Tribute
// ═══════════════════════════════════════════════════════════════════════════

describe('erc20TributeSchema', () => {
  it('accepts valid config', () => {
    const result = erc20TributeSchema.safeParse({
      tributeToken: '0x1234567890abcdef1234567890abcdef12345678',
      pricePerShare: '1.5',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid token address', () => {
    const result = erc20TributeSchema.safeParse({
      tributeToken: '0xinvalid',
      pricePerShare: '1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects pricePerShare=0', () => {
    const result = erc20TributeSchema.safeParse({
      tributeToken: '0x1234567890abcdef1234567890abcdef12345678',
      pricePerShare: '0',
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Navigator Config Warnings
// ═══════════════════════════════════════════════════════════════════════════

describe('getNavigatorWarnings', () => {
  it('flags unlimited when mintCap=0', () => {
    const warnings = getNavigatorWarnings('0', '100', '1700000000')
    expect(warnings.unlimitedMintCap).toBe(true)
    expect(warnings.unlimitedPerAddressCap).toBe(false)
    expect(warnings.noExpiry).toBe(false)
  })

  it('flags unlimited when perAddressCap=0', () => {
    const warnings = getNavigatorWarnings('100', '0', '1700000000')
    expect(warnings.unlimitedPerAddressCap).toBe(true)
    expect(warnings.unlimitedMintCap).toBe(false)
  })

  it('flags no expiry when expiry is empty string', () => {
    const warnings = getNavigatorWarnings('100', '100', '')
    expect(warnings.noExpiry).toBe(true)
    expect(warnings.unlimitedMintCap).toBe(false)
    expect(warnings.unlimitedPerAddressCap).toBe(false)
  })
})

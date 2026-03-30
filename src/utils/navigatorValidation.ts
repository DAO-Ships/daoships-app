import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════════
// Navigator Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════

export const onboarderMultiplierSchema = z.object({
  shareMultiplier: z.number().int().min(1).max(1000000), // 0.01x to 100x in bps
  lootMultiplier: z.number().int().min(0).max(1000000),
  minTribute: z.string().regex(/^\d+\.?\d*$/, 'Must be a valid amount'),
})

export const onboarderFixedPriceSchema = z
  .object({
    pricePerUnit: z
      .string()
      .regex(/^\d+\.?\d*$/)
      .refine((v) => parseFloat(v) > 0, 'Price must be > 0'),
    sharesPerUnit: z.number().int().min(0),
    lootPerUnit: z.number().int().min(0),
  })
  .refine((d) => d.sharesPerUnit > 0 || d.lootPerUnit > 0, 'Must mint shares or loot or both')

export const erc20TributeSchema = z.object({
  tributeToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid token address'),
  pricePerShare: z
    .string()
    .regex(/^\d+\.?\d*$/)
    .refine((v) => parseFloat(v) > 0, 'Price per share must be > 0'),
  pricePerLoot: z
    .string()
    .regex(/^\d+\.?\d*$/)
    .optional(),
})

// Warnings (not errors) for dangerous configs
export interface NavigatorConfigWarnings {
  unlimitedMintCap: boolean
  unlimitedPerAddressCap: boolean
  noExpiry: boolean
}

export function getNavigatorWarnings(
  mintCap: string,
  perAddressCap: string,
  expiry: string,
): NavigatorConfigWarnings {
  return {
    unlimitedMintCap: mintCap === '0' || mintCap === '',
    unlimitedPerAddressCap: perAddressCap === '0' || perAddressCap === '',
    noExpiry: expiry === '0' || expiry === '',
  }
}

import { z } from 'zod'
import { isAddress } from '@/services/utils/AddressUtils'

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

// SignalNavigator: max duration / start-delay window. Mirrors the contract's MAX_WINDOW
// (3650 days). The constructor reverts InvalidDuration / InvalidStartTime outside these bounds.
export const SIGNAL_MAX_WINDOW_SECONDS = 3650 * 24 * 60 * 60

/**
 * SignalNavigator deploy config. All durations are in SECONDS.
 * Mirrors the constructor reverts so the creator gets a field error instead of InvalidConfig:
 *   minDuration > 0, minDuration <= maxDuration <= MAX_WINDOW, maxStartDelay <= MAX_WINDOW.
 * `maxStartDelay = 0` is valid (immediate-only — no scheduling).
 */
export const signalNavigatorSchema = z
  .object({
    minSharesToCreatePoll: z
      .string()
      .regex(/^\d+\.?\d*$/, 'Must be a valid amount'),
    minDuration: z.number().int().positive('Minimum duration must be greater than 0'),
    maxDuration: z.number().int().max(SIGNAL_MAX_WINDOW_SECONDS, 'Exceeds the 3650-day maximum'),
    maxStartDelay: z
      .number()
      .int()
      .min(0)
      .max(SIGNAL_MAX_WINDOW_SECONDS, 'Exceeds the 3650-day maximum'),
  })
  .refine((d) => d.maxDuration >= d.minDuration, {
    message: 'Maximum duration must be at least the minimum duration',
    path: ['maxDuration'],
  })

export const erc20TributeSchema = z.object({
  tributeToken: z.string().refine(isAddress, 'Invalid token address'),
  pricePerShare: z
    .string()
    .regex(/^\d+\.?\d*$/)
    .refine((v) => parseFloat(v) > 0, 'Price per share must be > 0'),
  pricePerLoot: z
    .string()
    .regex(/^\d+\.?\d*$/)
    .optional(),
})

// TimelockNavigator: delay / expiry-window bounds. Mirror the contract constants so the
// creator gets a field error instead of DelayTooShort/DelayTooLong/InvalidConfig.
export const TIMELOCK_MIN_DELAY = 10 * 60 // 10 minutes
export const TIMELOCK_MAX_DELAY = 30 * 24 * 60 * 60 // 30 days
export const TIMELOCK_MIN_EXPIRY = 60 * 60 // 1 hour
export const TIMELOCK_MAX_EXPIRY = 3650 * 24 * 60 * 60 // 3650 days
export const TIMELOCK_RECOMMENDED_DELAY = 2 * 24 * 60 * 60 // 2 days (real exit window)

/**
 * TimelockNavigator deploy config. Durations are in SECONDS.
 * Hard bounds mirror the constructor; soft warnings (delay too short / shorter than the
 * grace period) are advisory — see getTimelockWarnings().
 */
export const timelockNavigatorSchema = z
  .object({
    delay: z
      .number()
      .int()
      .min(TIMELOCK_MIN_DELAY, 'Delay must be at least 10 minutes')
      .max(TIMELOCK_MAX_DELAY, 'Delay cannot exceed 30 days'),
    expiryWindow: z
      .number()
      .int()
      .min(TIMELOCK_MIN_EXPIRY, 'Expiry window must be at least 1 hour')
      .max(TIMELOCK_MAX_EXPIRY, 'Expiry window cannot exceed 3650 days'),
  })

/** Advisory warnings for a timelock config (not blocking). */
export interface TimelockConfigWarnings {
  /** delay < 2 days — too short to be a meaningful exit window. */
  delayBelowRecommended: boolean
  /** delay <= the DAO's grace period — members can't reliably exit before it lands. */
  delayNotLongerThanGrace: boolean
}

export function getTimelockWarnings(delaySeconds: number, gracePeriodSeconds: number): TimelockConfigWarnings {
  return {
    delayBelowRecommended: delaySeconds < TIMELOCK_RECOMMENDED_DELAY,
    delayNotLongerThanGrace: gracePeriodSeconds > 0 && delaySeconds <= gracePeriodSeconds,
  }
}

// SubscriptionNavigator: scalar config bounds. Mirror the contract constants so the
// creator gets field errors instead of InvalidConfig.
export const SUBSCRIPTION_MIN_PERIOD = 24 * 60 * 60 // 1 day
export const SUBSCRIPTION_MAX_PERIOD = 94608000 // ~3 years (1095 days)
export const SUBSCRIPTION_MAX_COLLECTOR_BPS = 10000 // 100%

/**
 * SubscriptionNavigator scalar deploy config (durations in SECONDS, reward in bps).
 * The token menu + per-token fees are validated separately in the form (non-empty, no
 * duplicate tokens, fee > 0, 1:1 length).
 */
export const subscriptionNavigatorSchema = z.object({
  periodDuration: z
    .number()
    .int()
    .min(SUBSCRIPTION_MIN_PERIOD, 'Period must be at least 1 day')
    .max(SUBSCRIPTION_MAX_PERIOD, 'Period cannot exceed ~3 years'),
  graceDuration: z.number().int().min(0, 'Grace cannot be negative'),
  collectorRewardBps: z
    .number()
    .int()
    .min(0, 'Reward cannot be negative')
    .max(SUBSCRIPTION_MAX_COLLECTOR_BPS, 'Reward cannot exceed 100% (10000 bps)'),
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

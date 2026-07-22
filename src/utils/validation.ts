// ═══════════════════════════════════════════════════════════════════════════
// Form Validation Schemas (Zod)
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod'
import { isAddress } from '@/services/utils/AddressUtils'

// ── react-hook-form validators ────────────────────────────────────────────

/**
 * Validate a human-entered token amount destined for parseTokenAmount().
 *
 * These fields fed strict BigInt conversion with NO validation rules registered —
 * `useController({control, name})` and `control.register(name)` without `rules` make
 * the wizard's `trigger()` call a no-op. Verified failure modes:
 *
 *   "1,000"                 -> throws "Cannot convert 1,000000000000000000000 to a BigInt"
 *   "abc" / "1e3"           -> throws
 *   "0.0000000000000000001" -> silently 0n (a founding member minted zero shares)
 *   "  "                    -> silently 0n
 *
 * The throw surfaces AFTER salt mining and after navigator deploys have been paid for.
 *
 * @param opts.allowZero    permit "0" (loot and offerings may legitimately be zero)
 * @param opts.label        field name used in the message
 */
export function validateTokenAmount(
  value: string | undefined,
  opts: { allowZero?: boolean; label?: string } = {},
): true | string {
  const { allowZero = true, label = 'Amount' } = opts
  const raw = (value ?? '').trim()

  if (raw === '') return allowZero ? true : `${label} is required`

  // Reject thousands separators, scientific notation, signs and stray text up front —
  // parseTokenAmount would otherwise throw deep inside the launch pipeline.
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return `${label} must be a plain number (no commas, letters, or scientific notation)`
  }

  const [, fraction = ''] = raw.split('.')
  if (fraction.length > 18) {
    return `${label} cannot have more than 18 decimal places`
  }

  // Non-empty input that scales to zero is a silent footgun, not a valid entry.
  const scalesToZero = /^0*(\.0*)?$/.test(raw)
  if (scalesToZero && !allowZero) return `${label} must be greater than zero`

  return true
}

// ── Shared field patterns ─────────────────────────────────────────────────

/** Ethereum / Quai 0x-prefixed address (format + EIP-55 checksum, via quais) */
const addressField = z
  .string()
  .refine(isAddress, 'Must be a valid address')

/** Positive BigInt-compatible string with optional upper bound */
const bigintString = z
  .string()
  .regex(/^\d+$/, 'Must be a non-negative integer')

/** BigInt string for share/loot amounts, capped at 10^30 to prevent overflow */
const cappedBigintString = z
  .string()
  .regex(/^\d+$/, 'Must be a non-negative integer')
  .refine(
    (v) => BigInt(v) <= 10n ** 30n,
    'Amount exceeds maximum (10^30)',
  )

// ── Summon DAO Schemas ────────────────────────────────────────────────────

/**
 * Step 1: Basic DAO information.
 */
export const summonBasicInfoSchema = z.object({
  name: z
    .string()
    .min(1, 'DAO name is required')
    .max(64, 'DAO name must be 64 characters or fewer'),
  description: z
    .string()
    .max(280, 'Description must be 280 characters or fewer')
    .optional()
    .default(''),
  shareTokenName: z
    .string()
    .max(32, 'Token name must be 32 characters or fewer')
    .optional()
    .default(''),
  shareTokenSymbol: z
    .string()
    .max(10, 'Token symbol must be 10 characters or fewer')
    .optional()
    .default(''),
  lootTokenName: z
    .string()
    .max(32, 'Token name must be 32 characters or fewer')
    .optional()
    .default(''),
  lootTokenSymbol: z
    .string()
    .max(10, 'Token symbol must be 10 characters or fewer')
    .optional()
    .default(''),
})

export type SummonBasicInfo = z.infer<typeof summonBasicInfoSchema>

/**
 * Step 2: Initial member distribution.
 */
export const summonMembersSchema = z.object({
  members: z
    .array(
      z.object({
        address: addressField,
        shares: cappedBigintString,
        loot: cappedBigintString,
      }),
    )
    .min(1, 'At least one member is required'),
})

export type SummonMembers = z.infer<typeof summonMembersSchema>

/**
 * Shared governance configuration fields.
 * Used by both the launch wizard and governance-change proposals.
 */
const governanceFieldsSchema = z.object({
  votingPeriod: z
    .number()
    .int()
    .min(60, 'Voting period must be at least 60 seconds (contract minimum)')
    .max(4_294_967_295, 'Voting period exceeds uint32 max (4294967295)'),
  gracePeriod: z
    .number()
    .int()
    .min(0, 'Grace period cannot be negative')
    .max(4_294_967_295, 'Grace period exceeds uint32 max (4294967295)'),
  quorumPercent: z
    .number()
    .min(0, 'Quorum percent must be 0 or greater')
    .max(100, 'Quorum percent must be 100 or less'),
  proposalOffering: cappedBigintString.optional().default('0'),
  sponsorThreshold: cappedBigintString.optional().default('1'),
  minRetentionPercent: z
    .number()
    .min(0, 'Min retention percent must be 0 or greater')
    .max(100, 'Min retention percent must be 100 or less')
    .optional()
    .default(0),
  defaultExpiryWindow: z
    .number()
    .int()
    .min(0, 'Default expiry window cannot be negative')
    .max(4_294_967_295, 'Default expiry window exceeds uint32 max (4294967295)')
    .optional()
    .default(0),
})

/**
 * Step 3: Governance configuration (summon wizard).
 */
export const summonGovernanceSchema = governanceFieldsSchema

export type SummonGovernance = z.infer<typeof summonGovernanceSchema>

// ── Proposal Form Schemas ─────────────────────────────────────────────────

/**
 * Basic proposal creation fields (title, description, type).
 */
export const proposalSchema = z.object({
  title: z
    .string()
    .min(1, 'Proposal title is required')
    .max(120, 'Title must be 120 characters or fewer'),
  description: z
    .string()
    .max(2000, 'Description must be 2000 characters or fewer')
    .optional()
    .default(''),
  proposalType: z.enum(['signal', 'funding', 'membership', 'govconfig', 'custom'], {
    required_error: 'Proposal type is required',
  }),
})

export type ProposalForm = z.infer<typeof proposalSchema>

/**
 * Funding proposal: transfer tokens to a recipient.
 */
export const fundingFormSchema = z.object({
  recipient: addressField,
  tokenAddress: addressField,
  amount: bigintString.refine((v) => BigInt(v) > 0n, 'Amount must be greater than zero'),
})

export type FundingForm = z.infer<typeof fundingFormSchema>

/**
 * Membership proposal: mint or burn shares/loot for members.
 */
export const membershipFormSchema = z.object({
  members: z
    .array(
      z.object({
        address: addressField,
        shares: bigintString,
        loot: bigintString,
        action: z.enum(['mint', 'burn']),
      }),
    )
    .min(1, 'At least one member action is required'),
})

export type MembershipForm = z.infer<typeof membershipFormSchema>

/**
 * Governance config change proposal (same fields as summon governance).
 */
export const governanceFormSchema = governanceFieldsSchema

export type GovernanceForm = z.infer<typeof governanceFormSchema>

/**
 * Delegate shares to another member.
 */
export const delegateSchema = z.object({
  delegateTo: addressField,
})

export type DelegateForm = z.infer<typeof delegateSchema>

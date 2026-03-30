// ═══════════════════════════════════════════════════════════════════════════
// Form Validation Schemas (Zod)
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod'

// ── Shared field patterns ─────────────────────────────────────────────────

/** Ethereum / Quai 0x-prefixed address */
const addressField = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 42-character hex address')

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
    .max(120, 'DAO name must be 120 characters or fewer'),
  description: z
    .string()
    .max(2000, 'Description must be 2000 characters or fewer')
    .optional()
    .default(''),
  shareTokenName: z
    .string()
    .max(60, 'Token name must be 60 characters or fewer')
    .optional()
    .default(''),
  shareTokenSymbol: z
    .string()
    .max(10, 'Token symbol must be 10 characters or fewer')
    .optional()
    .default(''),
  lootTokenName: z
    .string()
    .max(60, 'Token name must be 60 characters or fewer')
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
 * Step 3: Governance configuration.
 */
export const summonGovernanceSchema = z.object({
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

export type SummonGovernance = z.infer<typeof summonGovernanceSchema>

// ── Proposal Form Schemas ─────────────────────────────────────────────────

/**
 * Basic proposal creation fields (title, description, type).
 */
export const proposalSchema = z.object({
  title: z
    .string()
    .min(1, 'Proposal title is required')
    .max(240, 'Title must be 240 characters or fewer'),
  description: z
    .string()
    .max(5000, 'Description must be 5000 characters or fewer')
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
 * Governance config change proposal.
 */
export const governanceFormSchema = z.object({
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

export type GovernanceForm = z.infer<typeof governanceFormSchema>

/**
 * Delegate shares to another member.
 */
export const delegateSchema = z.object({
  delegateTo: addressField,
})

export type DelegateForm = z.infer<typeof delegateSchema>

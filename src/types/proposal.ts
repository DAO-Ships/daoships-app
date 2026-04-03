// ═══════════════════════════════════════════════════════════════════════════
// Proposal Types - matches ds_proposals table
// ═══════════════════════════════════════════════════════════════════════════

import type { DaoExpiryConfig } from './dao'

/**
 * Proposal lifecycle status.
 * Matches the `ds_proposal_status` PostgreSQL enum exactly.
 */
export enum ProposalStatus {
  Unborn = 'unborn',
  Submitted = 'submitted',
  Voting = 'voting',
  Grace = 'grace',
  Ready = 'ready',
  Processed = 'processed',
  ActionFailed = 'action failed',
  Cancelled = 'cancelled',
  Defeated = 'defeated',
  Expired = 'expired',
}

/**
 * High-level proposal type categories.
 * Determined by inspecting the proposal's encoded action data.
 */
export enum ProposalType {
  Signal = 'signal',
  Funding = 'funding',
  Membership = 'membership',
  GuildTokens = 'guildtokens',
  GovConfig = 'govconfig',
  Navigator = 'navigator',
  Profile = 'profile',
  Announcement = 'announcement',
  Custom = 'custom',
}

/**
 * Represents a proposal as stored in ds_proposals.
 * BIGINT columns come through as JS number from Supabase.
 * NUMERIC(78,0) columns come through as string.
 */
export interface Proposal {
  /** Composite key: `${dao_id}-${proposal_id}` (matches indexer format) */
  id: string
  dao_id: string
  /** Sequential proposal number within the DAO (BIGINT) */
  proposal_id: number

  created_at: string
  submitter: string | null
  tx_hash: string

  proposal_data_hash: string
  proposal_data?: string
  details?: string

  prev_proposal_id?: number

  // Sponsorship
  sponsored: boolean
  sponsor?: string
  sponsor_tx_hash?: string
  sponsor_tx_at?: string
  self_sponsored?: boolean
  max_total_shares_at_sponsor?: string

  // Timing (voting_period is BIGINT → number)
  voting_period: number
  voting_starts?: string
  voting_ends?: string
  grace_ends?: string
  expiration?: string | null

  // Cancellation
  cancelled: boolean
  cancelled_tx_hash?: string
  cancelled_tx_at?: string
  cancelled_by?: string | null

  // Processing
  processed: boolean
  process_tx_hash?: string
  process_tx_at?: string
  processed_by?: string | null

  action_failed: boolean
  passed: boolean

  // Vote tallies (BIGINT → number for counts, NUMERIC → string for balances)
  yes_votes: number
  no_votes: number
  yes_balance: string
  no_balance: string

  max_total_shares_and_loot_at_vote: string
  proposal_offering?: string

  block_number?: number
}

/**
 * Timing information for countdown and timeline display.
 * Calculated client-side from the Proposal timestamps.
 */
export interface ProposalTiming {
  /** Current computed status */
  status: ProposalStatus
  /** Milliseconds remaining in the current phase (voting or grace), or 0 */
  timeRemainingMs: number
  /** Human-readable label for the current phase */
  phaseLabel: string
  /** When voting starts (epoch ms), or null if not yet sponsored */
  votingStartsMs: number | null
  /** When voting ends (epoch ms), or null if not yet sponsored */
  votingEndsMs: number | null
  /** When grace ends (epoch ms), or null if not yet sponsored */
  graceEndsMs: number | null
  /** When proposal expires (epoch ms), or null if no expiration */
  expirationMs: number | null
  /** Percentage of current phase elapsed (0-100) */
  phaseProgress: number
}

/**
 * Derive the current ProposalStatus from raw proposal fields.
 * Mirrors the contract's state() function including auto-expiry logic.
 *
 * @param proposal  The proposal row
 * @param daoConfig Optional DAO config for auto-expiry calculation.
 *                  If omitted, auto-expiry is not checked and proposals
 *                  without an explicit expiration always show as Ready.
 */
export function deriveProposalStatus(
  proposal: Proposal,
  daoConfig?: DaoExpiryConfig,
): ProposalStatus {
  if (proposal.cancelled) return ProposalStatus.Cancelled
  if (proposal.processed) {
    if (!proposal.passed) return ProposalStatus.Defeated
    if (proposal.action_failed) return ProposalStatus.ActionFailed
    return ProposalStatus.Processed
  }
  if (!proposal.sponsored) return ProposalStatus.Submitted

  // Sponsored but timing data not yet indexed (race between SubmitProposal
  // and SponsorProposal events for auto-sponsored proposals). Treat as Voting
  // until the indexer catches up with the timing fields.
  if (!proposal.voting_ends) return ProposalStatus.Voting

  const now = Date.now()

  // Explicit expiration check (before phase checks, matching the contract)
  if (proposal.expiration) {
    const expMs = new Date(proposal.expiration).getTime()
    if (now > expMs) return ProposalStatus.Expired
  }

  const votingEndsMs = new Date(proposal.voting_ends).getTime()
  if (now < votingEndsMs) return ProposalStatus.Voting

  if (proposal.grace_ends) {
    const graceEndsMs = new Date(proposal.grace_ends).getTime()
    if (now < graceEndsMs) return ProposalStatus.Grace
  }

  // Past grace period — check auto-expiry for proposals with no explicit expiration.
  // Mirrors the contract's M-7 logic: proposals in Ready state auto-expire after
  // graceEnds + defaultExpiryWindow (or 2*(votingPeriod+gracePeriod) fallback).
  if (!proposal.expiration && proposal.grace_ends && daoConfig) {
    const graceEndsMs = new Date(proposal.grace_ends).getTime()
    const windowSeconds = daoConfig.default_expiry_window > 0
      ? daoConfig.default_expiry_window
      : 2 * (daoConfig.voting_period + daoConfig.grace_period)
    const autoExpiryMs = graceEndsMs + windowSeconds * 1000
    if (now > autoExpiryMs) return ProposalStatus.Expired
  }

  return ProposalStatus.Ready
}

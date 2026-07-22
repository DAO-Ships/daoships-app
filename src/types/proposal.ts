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
  NavigatorSanction = 'navigator-sanction',
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
  proposal_data?: string | null
  details?: string | null

  prev_proposal_id?: number | null

  // Sponsorship
  sponsored: boolean
  sponsor?: string | null
  sponsor_tx_hash?: string | null
  sponsor_tx_at?: string | null
  self_sponsored?: boolean
  max_total_shares_at_sponsor?: string | null

  // Timing (voting_period is BIGINT → number)
  voting_period: number
  voting_starts?: string | null
  voting_ends?: string | null
  grace_ends?: string | null
  expiration?: string | null

  // Cancellation
  cancelled: boolean
  cancelled_tx_hash?: string | null
  cancelled_tx_at?: string | null
  cancelled_by?: string | null

  // Processing
  processed: boolean
  process_tx_hash?: string | null
  process_tx_at?: string | null
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

/**
 * Resolve a proposal's effective expiration time (ms epoch), or null if it has none.
 *
 * Mirrors the contract's expiry rules:
 *   - An explicit `expiration` timestamp always wins.
 *   - Otherwise, once sponsored, the M-7 auto-expiry applies: `graceEnds + window`,
 *     where window = `default_expiry_window` (if > 0) else `2 * (voting_period + grace_period)`.
 *
 * The auto-expiry only meaningfully applies to a passed proposal sitting in Ready
 * state; callers decide whether to surface it based on the proposal's phase.
 */
export function getProposalExpiry(
  proposal: Proposal,
  daoConfig?: DaoExpiryConfig,
): number | null {
  if (proposal.expiration) {
    const explicit = new Date(proposal.expiration).getTime()
    return Number.isNaN(explicit) ? null : explicit
  }
  if (proposal.grace_ends && daoConfig) {
    const graceEndsMs = new Date(proposal.grace_ends).getTime()
    if (Number.isNaN(graceEndsMs)) return null
    const windowSeconds = daoConfig.default_expiry_window > 0
      ? daoConfig.default_expiry_window
      : 2 * (daoConfig.voting_period + daoConfig.grace_period)
    return graceEndsMs + windowSeconds * 1000
  }
  return null
}

/**
 * Predict whether an unprocessed proposal is in the contract's "Ready" (passing)
 * state — i.e. whether it must be processed with its original action bytes (true)
 * or closed with empty `0x` as defeated (false).
 *
 * Mirrors the contract's `_didProposalPass()` EXACTLY — quorum then majority, both
 * measured on yes_balance:
 *   1. yes_balance >= quorum threshold (quorum_percent bps of max_total_shares_at_sponsor)
 *   2. yes_balance > no_balance
 *
 * Min-retention is intentionally NOT checked here. The contract excludes it from the
 * Ready/Defeated decision (`state()`/`_didProposalPass`); it applies only as a
 * post-hash-check ragequit veto during processing, which can skip execution but never
 * changes which data must be submitted. Including it here previously mispredicted
 * defeat for passing proposals, so we sent `0x` and the contract reverted with
 * HashMismatch (surfaced as "missing revert data").
 */
export function willProposalPass(
  proposal: Proposal,
  quorumPercent: string | bigint,
): boolean {
  const yes = BigInt(proposal.yes_balance || '0')
  const no = BigInt(proposal.no_balance || '0')

  const quorumBps = typeof quorumPercent === 'bigint' ? quorumPercent : BigInt(quorumPercent || '0')
  if (quorumBps > 0n) {
    // The snapshot is REQUIRED to evaluate quorum. Defaulting it to 0 makes the
    // threshold 0, so every yes>no proposal is predicted to pass — which drives a
    // wrong-branch processProposal and reverts with HashMismatch. Refuse to guess:
    // callers must handle this rather than act on a fabricated verdict.
    const snapshot = proposal.max_total_shares_at_sponsor
    if (snapshot === undefined || snapshot === null || snapshot === '') {
      throw new Error(
        'Cannot evaluate quorum: max_total_shares_at_sponsor is missing for proposal '
        + `${proposal.id}. Refusing to predict the outcome from an absent snapshot.`,
      )
    }
    const maxShares = BigInt(snapshot)
    const quorumThreshold = (maxShares * quorumBps) / 10000n
    if (yes < quorumThreshold) return false
  }

  return yes > no
}

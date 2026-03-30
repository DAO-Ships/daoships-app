// ═══════════════════════════════════════════════════════════════════════════
// Proposal Status Service
//
// Client-side time-based proposal status calculation.
// Mirrors the on-chain DAOShip.state() function and the database
// ds_get_proposal_status SQL function.
//
// Status enum order (matches DAOShip.ProposalState):
//   0 = Unborn
//   1 = Submitted
//   2 = Voting
//   3 = Grace
//   4 = Ready
//   5 = Processed
//   6 = Cancelled
//   7 = Defeated
//   8 = Expired
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Numeric proposal status matching the DAOShip contract enum.
 */
export enum ProposalStatusCode {
  Unborn = 0,
  Submitted = 1,
  Voting = 2,
  Grace = 3,
  Ready = 4,
  Processed = 5,
  Cancelled = 6,
  Defeated = 7,
  Expired = 8,
}

/**
 * Human-readable labels for each proposal status.
 */
export const PROPOSAL_STATUS_LABELS: Record<ProposalStatusCode, string> = {
  [ProposalStatusCode.Unborn]: 'Unborn',
  [ProposalStatusCode.Submitted]: 'Submitted',
  [ProposalStatusCode.Voting]: 'Voting',
  [ProposalStatusCode.Grace]: 'Grace Period',
  [ProposalStatusCode.Ready]: 'Ready to Process',
  [ProposalStatusCode.Processed]: 'Processed',
  [ProposalStatusCode.Cancelled]: 'Cancelled',
  [ProposalStatusCode.Defeated]: 'Defeated',
  [ProposalStatusCode.Expired]: 'Expired',
}

/**
 * Minimal proposal fields required for status calculation.
 */
export interface ProposalForStatus {
  /** Whether the proposal has been cancelled */
  cancelled: boolean
  /** Whether the proposal has been processed */
  processed: boolean
  /** Whether the proposal passed (only meaningful if processed) */
  passed: boolean
  /** Whether the proposal has been sponsored */
  sponsored: boolean
  /** Voting start timestamp (ISO string or epoch seconds), null if unsponsored */
  votingStarts: string | number | null
  /** Voting end timestamp (ISO string or epoch seconds), null if unsponsored */
  votingEnds: string | number | null
  /** Grace period end timestamp (ISO string or epoch seconds), null if unsponsored */
  graceEnds: string | number | null
  /** Proposal expiration timestamp (ISO string or epoch seconds), null if no expiration */
  expiration: string | number | null
}

/**
 * Convert a timestamp value (ISO string, epoch seconds, or epoch ms) to epoch milliseconds.
 */
function toEpochMs(value: string | number | null): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    // Distinguish seconds from milliseconds
    return value > 1e12 ? value : value * 1000
  }
  // ISO string or numeric string
  const parsed = Date.parse(value)
  if (!isNaN(parsed)) return parsed
  // Try as epoch seconds string
  const num = Number(value)
  if (!isNaN(num)) return num > 1e12 ? num : num * 1000
  return null
}

/**
 * Calculate the current status of a proposal based on its fields and the current time.
 *
 * Logic (matches DAOShip contract):
 *   1. If cancelled -> Cancelled
 *   2. If processed -> Processed (passed) or Defeated (!passed)
 *   3. If not sponsored -> if expired -> Expired, else Submitted
 *   4. If in voting period -> Voting
 *   5. If in grace period -> Grace
 *   6. Otherwise -> Ready
 *
 * @param proposal - Proposal fields required for status calculation
 * @param nowMs    - Current time in epoch milliseconds (defaults to Date.now())
 * @returns The computed ProposalStatusCode
 */
export function calculateProposalStatus(
  proposal: ProposalForStatus,
  nowMs: number = Date.now(),
): ProposalStatusCode {
  // Cancelled takes priority
  if (proposal.cancelled) {
    return ProposalStatusCode.Cancelled
  }

  // Already processed
  if (proposal.processed) {
    return proposal.passed ? ProposalStatusCode.Processed : ProposalStatusCode.Defeated
  }

  // Not yet sponsored
  if (!proposal.sponsored) {
    const expirationMs = toEpochMs(proposal.expiration)
    if (expirationMs !== null && expirationMs > 0 && nowMs > expirationMs) {
      return ProposalStatusCode.Expired
    }
    return ProposalStatusCode.Submitted
  }

  // Sponsored: check timing phases
  const votingEndsMs = toEpochMs(proposal.votingEnds)
  const graceEndsMs = toEpochMs(proposal.graceEnds)
  const expirationMs = toEpochMs(proposal.expiration)

  // Check expiration first (after sponsorship)
  if (expirationMs !== null && expirationMs > 0 && nowMs > expirationMs) {
    return ProposalStatusCode.Expired
  }

  // In voting period
  if (votingEndsMs !== null && nowMs < votingEndsMs) {
    return ProposalStatusCode.Voting
  }

  // In grace period
  if (graceEndsMs !== null && nowMs < graceEndsMs) {
    return ProposalStatusCode.Grace
  }

  // Past grace period, ready to process
  return ProposalStatusCode.Ready
}

/**
 * Get the human-readable label for a proposal status code.
 */
export function getProposalStatusLabel(status: ProposalStatusCode): string {
  return PROPOSAL_STATUS_LABELS[status] ?? 'Unknown'
}

/**
 * Calculate time remaining in the current phase (voting or grace).
 *
 * @param proposal - Proposal fields
 * @param nowMs    - Current time in epoch milliseconds
 * @returns Milliseconds remaining in the current phase, or 0 if not in an active phase
 */
export function getPhaseTimeRemainingMs(
  proposal: ProposalForStatus,
  nowMs: number = Date.now(),
): number {
  const status = calculateProposalStatus(proposal, nowMs)

  if (status === ProposalStatusCode.Voting) {
    const votingEndsMs = toEpochMs(proposal.votingEnds)
    if (votingEndsMs !== null) {
      return Math.max(0, votingEndsMs - nowMs)
    }
  }

  if (status === ProposalStatusCode.Grace) {
    const graceEndsMs = toEpochMs(proposal.graceEnds)
    if (graceEndsMs !== null) {
      return Math.max(0, graceEndsMs - nowMs)
    }
  }

  return 0
}

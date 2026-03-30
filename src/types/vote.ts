// ═══════════════════════════════════════════════════════════════════════════
// Vote Types - matches ds_votes table
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents a vote on a proposal as stored in ds_votes.
 */
export interface Vote {
  /** Composite key: `${proposal_id}-${voter}` */
  id: string
  dao_id: string
  /** References ds_proposals.id */
  proposal_id: string

  voter: string
  approved: boolean
  balance: string

  created_at: string
  tx_hash: string
  block_number?: number
}

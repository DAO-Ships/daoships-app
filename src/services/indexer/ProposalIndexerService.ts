// ═══════════════════════════════════════════════════════════════════════════
// ProposalIndexerService - Proposal queries via Supabase (ds_proposals)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import { fetchAllPages, MAX_ROWS } from './paginate'
import type { Proposal } from '@/types'

export interface ProposalFilters {
  /** Filter by cancelled/processed state to approximate status */
  status?: 'active' | 'cancelled' | 'processed'
}

/**
 * Columns the list view actually renders. Excludes proposal_data (the encoded
 * MultiSend blob) — the detail view fetches the full row on demand.
 */
const PROPOSAL_LIST_COLUMNS = [
  'id', 'dao_id', 'proposal_id', 'created_at', 'submitter', 'tx_hash',
  'proposal_data_hash', 'details', 'prev_proposal_id',
  'sponsored', 'sponsor', 'sponsor_tx_hash', 'sponsor_tx_at', 'self_sponsored',
  'max_total_shares_at_sponsor',
  'voting_period', 'voting_starts', 'voting_ends', 'grace_ends', 'expiration',
  'cancelled', 'cancelled_tx_hash', 'cancelled_tx_at', 'cancelled_by',
  'processed', 'process_tx_hash', 'process_tx_at', 'processed_by',
  'action_failed', 'passed',
  'yes_votes', 'no_votes', 'yes_balance', 'no_balance',
  'max_total_shares_and_loot_at_vote', 'proposal_offering', 'block_number',
].join(',')

/** Apply the status filter to a proposals query. */
function applyStatusFilter<Q extends {
  eq(column: string, value: unknown): Q
}>(query: Q, filters?: ProposalFilters): Q {
  if (filters?.status === 'active') return query.eq('cancelled', false).eq('processed', false)
  if (filters?.status === 'cancelled') return query.eq('cancelled', true)
  if (filters?.status === 'processed') return query.eq('processed', true)
  return query
}

class ProposalIndexerService {
  /**
   * List proposals for a DAO, optionally filtered.
   * Ordered by proposal_id descending (newest first).
   */
  async listProposals(daoId: string, filters?: ProposalFilters): Promise<Proposal[]> {
    if (!supabase) return []

    // Build fresh per page — PostgREST builders are single-use.
    const build = () => {
      let q = supabase!
        .from('ds_proposals')
        // Deliberately NOT select('*'): proposal_data is the encoded MultiSend blob and
        // `details` is permissionlessly attacker-authored, so pulling both for every row
        // re-downloaded the entire action payload of the DAO on every poll. The detail
        // view fetches the full row when it needs it.
        .select(PROPOSAL_LIST_COLUMNS)
        .eq('dao_id', daoId)
        .order('proposal_id', { ascending: false })
      q = applyStatusFilter(q, filters)
      return q
    }

    const { rows, truncated } = await fetchAllPages<Proposal>(
      build as never,
      (error) => indexerError('[ProposalIndexerService] listProposals', error),
    )
    if (truncated) {
      console.warn(
        `[ProposalIndexerService] listProposals hit the ${MAX_ROWS}-row ceiling for ${daoId}; `
        + 'the list is incomplete.',
      )
    }
    return rows
  }

  /**
   * Get a single proposal by its composite ID.
   * Composite ID format: `${daoId}-${proposalNum}`
   */
  async getProposal(compositeId: string): Promise<Proposal | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('ds_proposals')
      .select('*')
      .eq('id', compositeId)
      .maybeSingle()

    if (error) indexerError('[ProposalIndexerService] getProposal', error)

    return (data as Proposal) ?? null
  }

  /**
   * Get all active proposals for a DAO (not cancelled and not processed).
   * Ordered by proposal_id descending.
   */
  async getActiveProposals(daoId: string): Promise<Proposal[]> {
    return this.listProposals(daoId, { status: 'active' })
  }
}

export const proposalIndexerService = new ProposalIndexerService()

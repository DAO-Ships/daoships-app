// ═══════════════════════════════════════════════════════════════════════════
// ProposalIndexerService - Proposal queries via Supabase (ds_proposals)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import type { Proposal } from '@/types'

export interface ProposalFilters {
  /** Filter by cancelled/processed state to approximate status */
  status?: 'active' | 'cancelled' | 'processed'
}

class ProposalIndexerService {
  /**
   * List proposals for a DAO, optionally filtered.
   * Ordered by proposal_id descending (newest first).
   */
  async listProposals(daoId: string, filters?: ProposalFilters): Promise<Proposal[]> {
    if (!supabase) return []

    let query = supabase
      .from('ds_proposals')
      .select('*')
      .eq('dao_id', daoId)
      .order('proposal_id', { ascending: false })

    if (filters?.status === 'active') {
      query = query.eq('cancelled', false).eq('processed', false)
    } else if (filters?.status === 'cancelled') {
      query = query.eq('cancelled', true)
    } else if (filters?.status === 'processed') {
      query = query.eq('processed', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('[ProposalIndexerService] listProposals error:', error.message)
      return []
    }

    return (data as Proposal[]) ?? []
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
      .single()

    if (error) {
      console.error('[ProposalIndexerService] getProposal error:', error.message)
      return null
    }

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

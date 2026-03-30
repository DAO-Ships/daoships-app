// ═══════════════════════════════════════════════════════════════════════════
// VoteIndexerService - Vote queries via Supabase (ds_votes)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import type { Vote } from '@/types'

class VoteIndexerService {
  /**
   * Get all votes for a given proposal.
   * The proposalCompositeId should match ds_proposals.id format:
   * `${daoId}-${proposalNum}`
   *
   * Ordered by creation date descending (newest first).
   */
  async getProposalVotes(proposalCompositeId: string): Promise<Vote[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_votes')
      .select('*')
      .eq('proposal_id', proposalCompositeId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[VoteIndexerService] getProposalVotes error:', error.message)
      return []
    }

    return (data as Vote[]) ?? []
  }

  /**
   * Get all votes cast by a specific member within a DAO.
   * Ordered by creation date descending (newest first).
   */
  async getMemberVotes(daoId: string, memberAddress: string): Promise<Vote[]> {
    if (!supabase) return []

    const normalizedAddress = memberAddress.toLowerCase()

    const { data, error } = await supabase
      .from('ds_votes')
      .select('*')
      .eq('dao_id', daoId)
      .eq('voter', normalizedAddress)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[VoteIndexerService] getMemberVotes error:', error.message)
      return []
    }

    return (data as Vote[]) ?? []
  }
}

export const voteIndexerService = new VoteIndexerService()

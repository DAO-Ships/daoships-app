import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT events on ds_votes for a specific proposal.
 * Invalidates both the votes query and the parent proposal query so the UI
 * reflects new votes immediately without waiting for the next poll cycle.
 *
 * No-op when the Supabase client is null (direct-RPC mode).
 */
export function useRealtimeVotes(daoId: string | undefined, proposalId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !daoId || !proposalId) return

    const compositeProposalId = `${daoId}-${proposalId}`
    const channel = supabase
      .channel(`votes:${compositeProposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_votes',
          filter: `proposal_id=eq.${compositeProposalId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['votes', daoId, proposalId] })
          queryClient.invalidateQueries({ queryKey: ['proposal', daoId, proposalId] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, daoId, proposalId, queryClient])
}

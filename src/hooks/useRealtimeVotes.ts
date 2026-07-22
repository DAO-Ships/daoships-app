import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'
import { useDebouncedCallback } from './useDebouncedCallback'

/**
 * Subscribes to realtime INSERT events on ds_votes for a specific proposal.
 * Invalidates both the votes query and the parent proposal query so the UI
 * reflects new votes immediately without waiting for the next poll cycle.
 *
 * No-op when the Supabase client is null (direct-RPC mode).
 */
export function useRealtimeVotes(daoId: string | undefined, proposalId: string | undefined) {
  const queryClient = useQueryClient()

  // Debounced so a vote sweep collapses into one refetch of the (full) votes table.
  const invalidate = useDebouncedCallback(() => {
    // The votes query is registered as ['proposalVotes', `${daoId}-${proposalId}`]
    // (useProposalVotes). Invalidating ['votes', ...] matched nothing, so this
    // realtime channel was inert: the votes panel stayed frozen at mount while the
    // tally header polled, and the two visibly disagreed.
    queryClient.invalidateQueries({ queryKey: ['proposalVotes', `${daoId}-${proposalId}`] })
    queryClient.invalidateQueries({ queryKey: ['proposal', daoId, proposalId] })
  })

  useEffect(() => {
    const client = supabase
    if (!client || !daoId || !proposalId) return

    const compositeProposalId = `${daoId}-${proposalId}`

    const channel = client
      .channel(`votes:${compositeProposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | DELETE — DELETE fires on reorg tombstones
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_votes',
          filter: `proposal_id=eq.${compositeProposalId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      client.removeChannel(channel)
    }
  }, [daoId, proposalId, invalidate])
}

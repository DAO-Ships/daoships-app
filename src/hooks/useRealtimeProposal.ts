import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime UPDATE events on a specific proposal row.
 * Invalidates the React Query cache so the UI refreshes immediately
 * when the proposal status, vote tallies, or other fields change.
 *
 * No-op when the Supabase client is null (direct-RPC mode).
 */
export function useRealtimeProposal(daoId: string | undefined, proposalId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !daoId || !proposalId) return

    const compositeId = `${daoId}-${proposalId}`
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['proposal', daoId, proposalId] })
      queryClient.invalidateQueries({ queryKey: ['proposals', daoId] })
    }

    const channel = supabase
      .channel(`proposal:${compositeId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // UPDATE | DELETE — DELETE fires on reorg tombstones
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_proposals',
          filter: `id=eq.${compositeId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [daoId, proposalId, queryClient])
}

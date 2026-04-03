import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT/UPDATE events on ds_proposals for a specific DAO.
 * Invalidates the proposals list so new proposals and status changes
 * (sponsorship, voting, processing) appear immediately.
 */
export function useRealtimeProposals(daoId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !daoId) return

    const channel = supabase
      .channel(`proposals:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_proposals',
          filter: `dao_id=eq.${daoId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['proposals', daoId] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, daoId, queryClient])
}

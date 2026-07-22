import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'
import { useDebouncedCallback } from './useDebouncedCallback'

/**
 * Subscribes to realtime INSERT/UPDATE events on ds_proposals for a specific DAO.
 * Invalidates the proposals list so new proposals and status changes
 * (sponsorship, voting, processing) appear immediately.
 */
export function useRealtimeProposals(daoId: string | undefined) {
  const queryClient = useQueryClient()

  // Debounced so a burst of proposal row events collapses into one list refetch.
  const invalidate = useDebouncedCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['proposals', daoId] })
  })

  useEffect(() => {
    const client = supabase
    if (!client || !daoId) return

    const channel = client
      .channel(`proposals:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | UPDATE | DELETE — DELETE fires on reorg tombstones
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_proposals',
          filter: `dao_id=eq.${daoId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        // Force-refetch after a successful (re)connect — fills in events missed
        // during the disconnect window. Supabase does not replay missed events.
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      client.removeChannel(channel)
    }
  }, [daoId, invalidate])
}

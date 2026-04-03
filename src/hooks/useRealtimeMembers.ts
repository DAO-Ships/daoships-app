import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT/UPDATE events on ds_members for a specific DAO.
 * Invalidates the members and member queries so delegation, ragequit, and
 * share changes reflect immediately without waiting for the next poll.
 */
export function useRealtimeMembers(daoId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !daoId) return

    const channel = supabase
      .channel(`members:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_members',
          filter: `dao_id=eq.${daoId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['members', daoId] })
          queryClient.invalidateQueries({ queryKey: ['member', daoId] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, daoId, queryClient])
}

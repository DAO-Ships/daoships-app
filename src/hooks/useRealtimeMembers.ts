import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'
import { useDebouncedCallback } from './useDebouncedCallback'

/**
 * Subscribes to realtime INSERT/UPDATE events on ds_members for a specific DAO.
 * Invalidates the members and member queries so delegation, ragequit, and
 * share changes reflect immediately without waiting for the next poll.
 */
export function useRealtimeMembers(daoId: string | undefined) {
  const queryClient = useQueryClient()

  // Debounced so a burst of member row events (batch enroll, reorg tombstones) collapses
  // into a single list refetch instead of one per row.
  const invalidate = useDebouncedCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['members', daoId] })
    queryClient.invalidateQueries({ queryKey: ['member', daoId] })
  })

  useEffect(() => {
    if (!supabase || !daoId) return

    const channel = supabase
      .channel(`members:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | UPDATE | DELETE — DELETE fires on reorg tombstones
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_members',
          filter: `dao_id=eq.${daoId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [daoId, invalidate])
}

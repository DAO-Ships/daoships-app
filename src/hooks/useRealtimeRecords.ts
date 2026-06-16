import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT events on ds_records for a specific DAO.
 * Invalidates vote reasons, member profiles, and announcement queries
 * so Poster-based content appears immediately after on-chain confirmation.
 */
export function useRealtimeRecords(daoId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !daoId) return

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['voteReasons', daoId] })
      queryClient.invalidateQueries({ queryKey: ['memberProfile', daoId] })
      queryClient.invalidateQueries({ queryKey: ['memberProfiles', daoId] })
      queryClient.invalidateQueries({ queryKey: ['announcements', daoId] })
      queryClient.invalidateQueries({ queryKey: ['daoProfile', daoId] })
    }

    const channel = supabase
      .channel(`records:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | UPDATE | DELETE — DELETE fires on reorg tombstones
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_records',
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
  }, [daoId, queryClient])
}

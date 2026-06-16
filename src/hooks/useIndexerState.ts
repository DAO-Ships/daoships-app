import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'
import type { IndexerState } from '@/types'

/**
 * Reads `ds_indexer_state` (id=1, singleton row) and keeps it fresh via realtime.
 * Used for sync-status UI: "syncing..." banner, last indexed block, stale-data warnings.
 *
 * Returns `null` when supabase is not configured (direct-RPC mode).
 */
export function useIndexerState() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['indexerState'],
    queryFn: async (): Promise<IndexerState | null> => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('ds_indexer_state')
        .select('*')
        .eq('id', 1)
        .single()
      if (error) {
        console.warn('[useIndexerState] fetch error:', error.message)
        return null
      }
      return data as IndexerState
    },
    enabled: INDEXER_CONFIG.ENABLED,
    staleTime: 30_000,
  })

  // Realtime subscription — update cache when the indexer writes a new state row
  useEffect(() => {
    if (!supabase) return
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['indexerState'] })
    }
    const channel = supabase
      .channel('indexer-state')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_indexer_state',
          filter: 'id=eq.1',
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}

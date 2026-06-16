import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT/UPDATE on ds_timelock_changes for a DAO. Invalidates the
 * change list so queue/execute/cancel transitions appear immediately. Also invalidates the
 * bypass-warning query, which is driven by the related ds_governance_config_history.
 */
export function useRealtimeTimelockChanges(daoId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !daoId) return

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['timelockChanges', daoId] })
      queryClient.invalidateQueries({ queryKey: ['bypassedConfigChanges', daoId] })
    }

    const channel = supabase
      .channel(`timelockChanges:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_timelock_changes',
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

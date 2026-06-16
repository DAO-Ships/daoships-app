import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'
import { useDebouncedCallback } from './useDebouncedCallback'

/**
 * Subscribes to realtime INSERT/UPDATE on ds_vesting_schedules for a DAO. Invalidates the
 * schedule list so new schedules, derived `claimed` updates (on each claim), and revokes
 * appear immediately.
 *
 * ds_vesting_claims is append-only and NOT in the realtime publication — but every claim
 * also bumps the parent schedule's derived `claimed`, so this catches it; re-read the claim
 * feed on demand.
 */
export function useRealtimeVestingSchedules(daoId: string | undefined) {
  const queryClient = useQueryClient()

  // Debounced so a burst of schedule row events collapses into one list refetch.
  const invalidate = useDebouncedCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vestingSchedules', daoId] })
  })

  useEffect(() => {
    if (!supabase || !daoId) return

    const channel = supabase
      .channel(`vestingSchedules:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_vesting_schedules',
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

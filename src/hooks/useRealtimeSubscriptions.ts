import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT/UPDATE on ds_subscription_members for a DAO. Invalidates
 * the member list (and the per-member/payment/collection queries) so payments, enrollments,
 * and collections appear immediately. All three subscription tables are in the indexer's
 * realtime publication, but every payment/collection also bumps the parent member row
 * (paid_through / total_paid / last_collected_at), so the parent subscription catches the
 * activity; the append-only feeds are re-read on demand.
 */
export function useRealtimeSubscriptions(daoId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const client = supabase
    if (!client || !daoId) return

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptionMembers', daoId] })
      queryClient.invalidateQueries({ queryKey: ['subscriptionMember'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptionPayments'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptionCollections'] })
    }

    const channel = client
      .channel(`subscriptionMembers:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_subscription_members',
          filter: `dao_id=eq.${daoId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      client.removeChannel(channel)
    }
  }, [daoId, queryClient])
}

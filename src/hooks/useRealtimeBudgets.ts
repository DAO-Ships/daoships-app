import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Subscribes to realtime INSERT/UPDATE on ds_budgets for a DAO. Invalidates the budget
 * list so new/cancelled budgets and derived total_spent updates appear immediately.
 *
 * The append-only feeds (ds_budget_disbursements, ds_vault_module_events) are NOT in the
 * realtime publication — a disbursement also touches the parent budget row (total_spent),
 * so this catches activity; re-read the feeds on demand.
 */
export function useRealtimeBudgets(daoId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const client = supabase
    if (!client || !daoId) return

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', daoId] })
      queryClient.invalidateQueries({ queryKey: ['vaultModuleEvents', daoId] })
    }

    const channel = client
      .channel(`budgets:${daoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_budgets',
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

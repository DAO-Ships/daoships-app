import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's budgets.
 *
 * The append-only feeds (ds_budget_disbursements, ds_vault_module_events) are NOT in the
 * realtime publication — but a disbursement also touches the parent budget row
 * (total_spent), so watching ds_budgets catches that activity too.
 */
export function useRealtimeBudgets(daoId: string | undefined) {
  useRealtimeTable({
    channel: `budgets:${daoId}`,
    table: 'ds_budgets',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [['budgets', daoId], ['vaultModuleEvents', daoId]],
    enabled: !!daoId,
  })
}

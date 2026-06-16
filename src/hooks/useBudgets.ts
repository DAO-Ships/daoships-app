import { useQuery } from '@tanstack/react-query'
import { budgetIndexerService } from '@/services/indexer/BudgetIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a BudgetNavigator's budgets from the indexer (ds_budgets).
 * Polls every 30s when the page is visible (no realtime subscription yet).
 *
 * Rows exist only AFTER the navigator is enabled as a vault module (deferred +
 * backfilled) — a self_asserted (not-yet-enabled) navigator returns [] by design.
 */
export function useBudgets(daoId: string | undefined, navigatorAddress: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['budgets', daoId, navigatorAddress?.toLowerCase()],
    queryFn: () => budgetIndexerService.listBudgets(daoId!, navigatorAddress!),
    enabled: !!daoId && !!navigatorAddress,
    refetchInterval: isVisible ? 30000 : false,
  })
}

/**
 * Fetches the disbursement feed (ds_budget_disbursements) for a navigator,
 * optionally scoped to one budget. Newest first.
 */
export function useBudgetDisbursements(
  navigatorAddress: string | undefined,
  budgetId?: string,
) {
  return useQuery({
    queryKey: ['budgetDisbursements', navigatorAddress?.toLowerCase(), budgetId ?? 'all'],
    queryFn: () => budgetIndexerService.listDisbursements(navigatorAddress!, budgetId),
    enabled: !!navigatorAddress,
    staleTime: 30_000,
  })
}

/**
 * All disbursements for a navigator in ONE query, grouped by budget_id. Lets the budget
 * list render per-card feeds without firing a query per card (avoids N+1).
 */
export function useBudgetDisbursementsByNavigator(navigatorAddress: string | undefined) {
  return useQuery({
    queryKey: ['budgetDisbursementsByNavigator', navigatorAddress?.toLowerCase()],
    queryFn: async () => {
      const rows = await budgetIndexerService.listDisbursementsByNavigator(navigatorAddress!)
      const byBudget = new Map<string, typeof rows>()
      for (const row of rows) {
        const list = byBudget.get(row.budget_id) ?? []
        list.push(row)
        byBudget.set(row.budget_id, list)
      }
      return byBudget
    },
    enabled: !!navigatorAddress,
    staleTime: 30_000,
  })
}

/**
 * Fetches the vault module-access timeline (ds_vault_module_events) — the audit
 * trail behind a budget navigator's trust_status. Latest row is the current state.
 */
export function useVaultModuleEvents(
  daoId: string | undefined,
  navigatorAddress: string | undefined,
) {
  return useQuery({
    queryKey: ['vaultModuleEvents', daoId, navigatorAddress?.toLowerCase()],
    queryFn: () => budgetIndexerService.listModuleEvents(daoId!, navigatorAddress!),
    enabled: !!daoId && !!navigatorAddress,
    staleTime: 30_000,
  })
}

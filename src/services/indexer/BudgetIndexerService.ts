// ═══════════════════════════════════════════════════════════════════════════
// BudgetIndexerService - BudgetNavigator queries via Supabase
// (ds_budgets, ds_budget_disbursements, ds_vault_module_events)
// ───────────────────────────────────────────────────────────────────────────
// Budgets are DEFERRED by the indexer until the navigator is enabled as a vault
// module, then BACKFILLED — a self_asserted (not-yet-enabled) navigator returns []
// by design. Gate display on ds_navigators.trust_status='sanctioned' / is_active.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import { fetchAllPages, MAX_ROWS } from './paginate'
import type { BudgetRow, BudgetDisbursementRow, VaultModuleEventRow } from '@/types'

class BudgetIndexerService {
  /**
   * List a DAO's budgets, optionally scoped to one navigator. Newest first.
   * Empty for navigators that have never been enabled on the vault (deferred).
   */
  async listBudgets(daoId: string, navigatorAddress?: string): Promise<BudgetRow[]> {
    if (!supabase) return []

    let query = supabase.from('ds_budgets').select('*').eq('dao_id', daoId)
    if (navigatorAddress) query = query.eq('navigator_address', navigatorAddress.toLowerCase())

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) indexerError('[BudgetIndexerService] listBudgets', error)

    return (data as BudgetRow[]) ?? []
  }

  /**
   * Read one budget by navigator + budgetId. Returns null if not indexed yet.
   */
  async getBudget(navigatorAddress: string, budgetId: string): Promise<BudgetRow | null> {
    if (!supabase) return null

    const id = `${navigatorAddress.toLowerCase()}-${budgetId}`
    const { data, error } = await supabase.from('ds_budgets').select('*').eq('id', id).maybeSingle()

    if (error) indexerError('[BudgetIndexerService] getBudget', error)

    return (data as BudgetRow | null) ?? null
  }

  /**
   * List disbursements for a navigator (or one budget within it). Newest first.
   * This is the budget-activity feed — balances are tracked separately via Transfer.
   */
  async listDisbursements(
    navigatorAddress: string,
    budgetId?: string,
  ): Promise<BudgetDisbursementRow[]> {
    if (!supabase) return []

    let query = supabase
      .from('ds_budget_disbursements')
      .select('*')
      .eq('navigator_address', navigatorAddress.toLowerCase())
    if (budgetId !== undefined) query = query.eq('budget_id', budgetId)

    // Bounded: the UI shows only the most recent few. Avoids downloading an entire
    // disbursement history to render a 5-row feed.
    const { data, error } = await query.order('block_number', { ascending: false }).limit(25)

    if (error) indexerError('[BudgetIndexerService] listDisbursements', error)

    return (data as BudgetDisbursementRow[]) ?? []
  }

  /**
   * Disbursements for ALL budgets of a navigator in one query (newest first, bounded).
   * Callers group by budget_id client-side instead of firing a query per budget card.
   */
  async listDisbursementsByNavigator(navigatorAddress: string): Promise<BudgetDisbursementRow[]> {
    if (!supabase) return []

    const { rows, truncated } = await fetchAllPages<BudgetDisbursementRow>(
      () => supabase!
      .from('ds_budget_disbursements')
      .select('*')
      .eq('navigator_address', navigatorAddress.toLowerCase())
      .order('block_number', { ascending: false }) as never,
      (error) => indexerError('[BudgetIndexerService] listDisbursementsByNavigator', error),
    )
    if (truncated) {
      console.warn(
        `[listDisbursementsByNavigator] hit the ${MAX_ROWS}-row ceiling — this feed is incomplete, `
        + 'and the per-item history grouped from it client-side will be missing entries.',
      )
    }

    return rows
  }

  /**
   * The vault module-access timeline for a navigator (or all navigators in the DAO).
   * Each row is an authenticated EnabledModule/DisabledModule — the latest row is
   * what trust_status is derived from. Newest first (the current state is row 0).
   */
  async listModuleEvents(
    daoId: string,
    navigatorAddress?: string,
  ): Promise<VaultModuleEventRow[]> {
    if (!supabase) return []

    let query = supabase.from('ds_vault_module_events').select('*').eq('dao_id', daoId)
    if (navigatorAddress) query = query.eq('navigator_address', navigatorAddress.toLowerCase())

    const { data, error } = await query
      .order('block_number', { ascending: false })
      .order('log_index', { ascending: false })

    if (error) indexerError('[BudgetIndexerService] listModuleEvents', error)

    return (data as VaultModuleEventRow[]) ?? []
  }
}

export const budgetIndexerService = new BudgetIndexerService()

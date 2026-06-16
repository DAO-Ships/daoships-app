// ═══════════════════════════════════════════════════════════════════════════
// TimelockIndexerService - TimelockNavigator queries via Supabase
// (ds_timelock_changes, ds_governance_config_history)
// ───────────────────────────────────────────────────────────────────────────
// Permissioned GOVERNOR (always trust_status='sanctioned'). Queued changes carry the
// FULL governance_config bytes (the only place they live on-chain) — required verbatim
// by executeChange. ds_governance_config_history.bypassed_timelock flags direct config
// changes that skipped an active timelock (the warning that makes the timelock real).
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import type { TimelockChangeRow, GovernanceConfigHistoryRow } from '@/types'

class TimelockIndexerService {
  /**
   * List a DAO's queued/historical timelock changes, optionally scoped to one navigator.
   * Newest first.
   */
  async listChanges(daoId: string, navigatorAddress?: string): Promise<TimelockChangeRow[]> {
    if (!supabase) return []

    let query = supabase.from('ds_timelock_changes').select('*').eq('dao_id', daoId)
    if (navigatorAddress) query = query.eq('navigator_address', navigatorAddress.toLowerCase())

    const { data, error } = await query.order('block_number', { ascending: false })

    if (error) indexerError('[TimelockIndexerService] listChanges', error)

    return (data as TimelockChangeRow[]) ?? []
  }

  /**
   * Read one change by navigator + changeId. Read `governance_config` from this for the
   * executeChange call — the bytes aren't reconstructable from the hash.
   */
  async getChange(navigatorAddress: string, changeId: string): Promise<TimelockChangeRow | null> {
    if (!supabase) return null

    const id = `${navigatorAddress.toLowerCase()}-${changeId}`
    const { data, error } = await supabase
      .from('ds_timelock_changes')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) indexerError('[TimelockIndexerService] getChange', error)

    return (data as TimelockChangeRow | null) ?? null
  }

  /**
   * The DAO's governance-config change history (ds_governance_config_history), newest first.
   */
  async listConfigHistory(daoId: string): Promise<GovernanceConfigHistoryRow[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_governance_config_history')
      .select('*')
      .eq('dao_id', daoId)
      .order('block_number', { ascending: false })

    if (error) indexerError('[TimelockIndexerService] listConfigHistory', error)

    return (data as GovernanceConfigHistoryRow[]) ?? []
  }

  /**
   * Config changes that BYPASSED an active timelock — surface these as a trust warning.
   */
  async listBypassedConfigChanges(daoId: string): Promise<GovernanceConfigHistoryRow[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_governance_config_history')
      .select('*')
      .eq('dao_id', daoId)
      .eq('bypassed_timelock', true)
      .order('block_number', { ascending: false })

    if (error) indexerError('[TimelockIndexerService] listBypassedConfigChanges', error)

    return (data as GovernanceConfigHistoryRow[]) ?? []
  }
}

export const timelockIndexerService = new TimelockIndexerService()

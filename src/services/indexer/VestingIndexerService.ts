// ═══════════════════════════════════════════════════════════════════════════
// VestingIndexerService - VestingNavigator queries via Supabase
// (ds_vesting_schedules, ds_vesting_claims)
// ───────────────────────────────────────────────────────────────────────────
// VestingNavigator is permissioned MANAGER (always trust_status='sanctioned'), so
// schedules materialize as soon as they're created — no sanction gate. `claimed` on a
// schedule is the indexer's derive-from-truth SUM of claims; ds_vesting_claims is the
// append-only mint feed (not realtime — re-read on demand).
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import { fetchAllPages, MAX_ROWS } from './paginate'
import type { VestingScheduleRow, VestingClaimRow } from '@/types'

class VestingIndexerService {
  /**
   * List a DAO's vesting schedules, optionally scoped to one navigator. Newest first.
   */
  async listSchedules(daoId: string, navigatorAddress?: string): Promise<VestingScheduleRow[]> {
    if (!supabase) return []

    let query = supabase.from('ds_vesting_schedules').select('*').eq('dao_id', daoId)
    if (navigatorAddress) query = query.eq('navigator_address', navigatorAddress.toLowerCase())

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) indexerError('[VestingIndexerService] listSchedules', error)

    return (data as VestingScheduleRow[]) ?? []
  }

  /**
   * List a beneficiary's vesting schedules across the DAO (their personal claim view).
   */
  async listSchedulesForBeneficiary(
    daoId: string,
    beneficiary: string,
  ): Promise<VestingScheduleRow[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_vesting_schedules')
      .select('*')
      .eq('dao_id', daoId)
      .eq('beneficiary', beneficiary.toLowerCase())
      .order('created_at', { ascending: false })

    if (error) indexerError('[VestingIndexerService] listSchedulesForBeneficiary', error)

    return (data as VestingScheduleRow[]) ?? []
  }

  /**
   * Read one schedule by navigator + scheduleId. Returns null if not indexed yet.
   */
  async getSchedule(navigatorAddress: string, scheduleId: string): Promise<VestingScheduleRow | null> {
    if (!supabase) return null

    const id = `${navigatorAddress.toLowerCase()}-${scheduleId}`
    const { data, error } = await supabase
      .from('ds_vesting_schedules')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) indexerError('[VestingIndexerService] getSchedule', error)

    return (data as VestingScheduleRow | null) ?? null
  }

  /**
   * The incremental mint feed for ALL schedules of a navigator (ds_vesting_claims), newest
   * first. One query for the whole list view — callers group by schedule_id client-side
   * instead of firing a query per schedule card (avoids N+1).
   */
  async listClaimsByNavigator(navigatorAddress: string): Promise<VestingClaimRow[]> {
    if (!supabase) return []

    const { rows, truncated } = await fetchAllPages<VestingClaimRow>(
      () => supabase!
      .from('ds_vesting_claims')
      .select('*')
      .eq('navigator_address', navigatorAddress.toLowerCase())
      .order('block_number', { ascending: false }) as never,
      (error) => indexerError('[VestingIndexerService] listClaimsByNavigator', error),
    )
    if (truncated) {
      console.warn(
        `[listClaimsByNavigator] hit the ${MAX_ROWS}-row ceiling — this feed is incomplete, `
        + 'and the per-item history grouped from it client-side will be missing entries.',
      )
    }

    return rows
  }

  /**
   * The incremental mint feed for one schedule (ds_vesting_claims), newest first.
   * Activity only — balances come from the token Transfer applied to ds_members.
   */
  async listClaims(navigatorAddress: string, scheduleId: string): Promise<VestingClaimRow[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_vesting_claims')
      .select('*')
      .eq('navigator_address', navigatorAddress.toLowerCase())
      .eq('schedule_id', scheduleId)
      .order('block_number', { ascending: false })
      .limit(25)

    if (error) indexerError('[VestingIndexerService] listClaims', error)

    return (data as VestingClaimRow[]) ?? []
  }
}

export const vestingIndexerService = new VestingIndexerService()

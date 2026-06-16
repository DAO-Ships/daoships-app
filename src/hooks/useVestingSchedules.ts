import { useQuery } from '@tanstack/react-query'
import { vestingIndexerService } from '@/services/indexer/VestingIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a DAO's vesting schedules (ds_vesting_schedules), optionally scoped to one
 * navigator. Polls every 30s when visible (the derived `claimed` updates on each claim).
 */
export function useVestingSchedules(daoId: string | undefined, navigatorAddress: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['vestingSchedules', daoId, navigatorAddress?.toLowerCase()],
    queryFn: () => vestingIndexerService.listSchedules(daoId!, navigatorAddress!),
    enabled: !!daoId && !!navigatorAddress,
    refetchInterval: isVisible ? 30000 : false,
  })
}

/** The incremental mint feed (ds_vesting_claims) for one schedule. */
export function useVestingClaims(navigatorAddress: string | undefined, scheduleId: string | undefined) {
  return useQuery({
    queryKey: ['vestingClaims', navigatorAddress?.toLowerCase(), scheduleId],
    queryFn: () => vestingIndexerService.listClaims(navigatorAddress!, scheduleId!),
    enabled: !!navigatorAddress && scheduleId !== undefined,
    staleTime: 30_000,
  })
}

/**
 * All claims for a navigator in ONE query, grouped by schedule_id. Lets the schedule list
 * render per-card claim history without firing a query per card (avoids N+1).
 */
export function useVestingClaimsByNavigator(navigatorAddress: string | undefined) {
  return useQuery({
    queryKey: ['vestingClaimsByNavigator', navigatorAddress?.toLowerCase()],
    queryFn: async () => {
      const rows = await vestingIndexerService.listClaimsByNavigator(navigatorAddress!)
      const bySchedule = new Map<string, typeof rows>()
      for (const row of rows) {
        const list = bySchedule.get(row.schedule_id) ?? []
        list.push(row)
        bySchedule.set(row.schedule_id, list)
      }
      return bySchedule
    },
    enabled: !!navigatorAddress,
    staleTime: 30_000,
  })
}

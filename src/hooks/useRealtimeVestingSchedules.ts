import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's vesting schedules.
 */
export function useRealtimeVestingSchedules(daoId: string | undefined) {
  useRealtimeTable({
    channel: `vestingSchedules:${daoId}`,
    table: 'ds_vesting_schedules',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [['vestingSchedules', daoId]],
    enabled: !!daoId,
  })
}

import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's queued timelock changes.
 */
export function useRealtimeTimelockChanges(daoId: string | undefined) {
  useRealtimeTable({
    channel: `timelockChanges:${daoId}`,
    table: 'ds_timelock_changes',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [['timelockChanges', daoId], ['bypassedConfigChanges', daoId]],
    enabled: !!daoId,
  })
}

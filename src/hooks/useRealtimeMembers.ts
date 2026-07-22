import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's members — delegation, ragequit and share changes reflect
 * without waiting for the next poll.
 */
export function useRealtimeMembers(daoId: string | undefined) {
  useRealtimeTable({
    channel: `members:${daoId}`,
    table: 'ds_members',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [['members', daoId], ['member', daoId]],
    enabled: !!daoId,
  })
}

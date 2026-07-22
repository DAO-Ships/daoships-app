import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's proposal list — new proposals and status changes
 * (sponsorship, voting, processing).
 */
export function useRealtimeProposals(daoId: string | undefined) {
  useRealtimeTable({
    channel: `proposals:${daoId}`,
    table: 'ds_proposals',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [['proposals', daoId]],
    enabled: !!daoId,
  })
}

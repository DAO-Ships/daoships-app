import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for ONE proposal row — status transitions and vote tallies.
 */
export function useRealtimeProposal(daoId: string | undefined, proposalId: string | undefined) {
  const compositeId = daoId && proposalId ? `${daoId}-${proposalId}` : ''
  useRealtimeTable({
    channel: `proposal:${compositeId}`,
    table: 'ds_proposals',
    filter: compositeId ? `id=eq.${compositeId}` : '',
    queryKeys: [['proposal', daoId, proposalId], ['proposals', daoId]],
    enabled: !!compositeId,
  })
}

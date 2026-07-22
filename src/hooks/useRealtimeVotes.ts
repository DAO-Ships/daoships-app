import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for the votes on ONE proposal.
 *
 * NOTE: the votes query is registered as ['proposalVotes', `${daoId}-${proposalId}`]
 * (useProposalVotes). This hook previously invalidated ['votes', …], which matched no
 * registered query at all, so the channel was inert: the votes panel stayed frozen at
 * mount while the tally header polled, and the two visibly disagreed.
 */
export function useRealtimeVotes(daoId: string | undefined, proposalId: string | undefined) {
  const compositeProposalId = daoId && proposalId ? `${daoId}-${proposalId}` : ''
  useRealtimeTable({
    channel: `votes:${compositeProposalId}`,
    table: 'ds_votes',
    filter: compositeProposalId ? `proposal_id=eq.${compositeProposalId}` : '',
    queryKeys: [['proposalVotes', compositeProposalId], ['proposal', daoId, proposalId]],
    enabled: !!compositeProposalId,
  })
}

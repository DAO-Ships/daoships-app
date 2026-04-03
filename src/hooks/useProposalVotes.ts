import { useQuery } from '@tanstack/react-query'
import { voteIndexerService } from '@/services/indexer/VoteIndexerService'
import type { Vote } from '@/types'

/**
 * Fetches all votes for a specific proposal.
 */
export function useProposalVotes(daoId: string | undefined, proposalId: number | undefined) {
  const compositeId = daoId && proposalId !== undefined ? `${daoId}-${proposalId}` : undefined

  return useQuery<Vote[]>({
    queryKey: ['proposalVotes', compositeId],
    queryFn: () => voteIndexerService.getProposalVotes(compositeId!),
    enabled: !!compositeId,
    staleTime: 15_000,
  })
}

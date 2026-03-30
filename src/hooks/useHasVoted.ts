import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'

/**
 * Query hook that checks whether a member has already voted on a proposal.
 * Returns false while loading or if parameters are missing.
 */
export function useHasVoted(
  daoId: string | undefined,
  proposalId: number | undefined,
  memberAddress: string | undefined,
) {
  return useQuery({
    queryKey: ['hasVoted', daoId, proposalId, memberAddress],
    queryFn: () => daoService.hasVoted(daoId!, proposalId!, memberAddress!),
    enabled: !!daoId && proposalId !== undefined && !!memberAddress,
    staleTime: 30_000,
  })
}

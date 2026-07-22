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
    // This resolves from the indexer and returns FALSE (not an error) while a vote is
    // still un-ingested, so with more than a few seconds of lag the Vote buttons
    // re-enabled and the member was invited to double-vote into a revert. Keep polling
    // briefly so the answer self-corrects, and re-check on focus.
    refetchInterval: (query) => (query.state.data === true ? false : 5_000),
    refetchOnWindowFocus: true,
  })
}

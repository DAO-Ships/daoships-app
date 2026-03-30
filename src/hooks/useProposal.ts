import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a single proposal by DAO id and proposal id.
 * Polls every 10 seconds when the page is visible (proposals are time-sensitive).
 * Disabled when either daoId or proposalId is missing.
 */
export function useProposal(daoId: string | undefined, proposalId: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['proposal', daoId, proposalId],
    queryFn: () => daoService.getProposal(`${daoId!}-${proposalId!}`),
    enabled: !!daoId && !!proposalId,
    refetchInterval: isVisible ? 10000 : false,
  })
}

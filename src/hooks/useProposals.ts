import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches proposals for a specific DAO, with optional status filtering.
 * Polls every 10 seconds when the page is visible (proposals are time-sensitive).
 * Disabled when no daoId is provided.
 */
export function useProposals(daoId: string | undefined, status?: string) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['proposals', daoId, status ?? 'all'],
    queryFn: () => daoService.getProposals(daoId!, status ? { status: status as 'active' | 'cancelled' | 'processed' } : undefined),
    enabled: !!daoId,
    staleTime: 8000,
    refetchInterval: isVisible ? 10000 : false,
  })
}

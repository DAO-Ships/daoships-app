import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a single DAO by its contract address (id).
 * Uses the DaoService facade which tries the indexer first,
 * then falls back to on-chain reads if the indexer is unavailable.
 * Polls every 15 seconds when the page is visible.
 */
export function useDao(daoId: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['dao', daoId],
    queryFn: () => daoService.getDao(daoId!),
    enabled: !!daoId,
    refetchInterval: isVisible ? 15000 : false,
  })
}

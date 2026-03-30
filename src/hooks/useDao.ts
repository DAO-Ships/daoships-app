import { useQuery } from '@tanstack/react-query'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a single DAO by its contract address (id).
 * Polls every 15 seconds when the page is visible.
 * Disabled when no daoId is provided.
 */
export function useDao(daoId: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['dao', daoId],
    queryFn: () => daoIndexerService.getDao(daoId!),
    enabled: !!daoId,
    refetchInterval: isVisible ? 15000 : false,
  })
}

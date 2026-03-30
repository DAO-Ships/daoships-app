import { useQuery } from '@tanstack/react-query'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches the list of all DAOs.
 * Polls every 30 seconds when the page is visible.
 * An optional filter string is included in the query key for cache separation
 * (client-side filtering to be applied by the consumer).
 */
export function useDaos(filter?: string) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['daos', filter ?? 'all'],
    queryFn: () => daoIndexerService.listDaos(),
    refetchInterval: isVisible ? 30000 : false,
  })
}

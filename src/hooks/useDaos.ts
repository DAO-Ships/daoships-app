import { useQuery } from '@tanstack/react-query'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches the list of all DAOs.
 * Polls every 30 seconds when the page is visible.
 * Filtering/sorting is done client-side by the consumer.
 */
export function useDaos() {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['daos'],
    queryFn: () => daoIndexerService.listDaos(),
    refetchInterval: isVisible ? 30000 : false,
  })
}

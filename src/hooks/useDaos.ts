import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
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
    queryFn: () => daoService.getDaos(),
    staleTime: 25000,
    refetchInterval: isVisible ? 30000 : false,
  })
}

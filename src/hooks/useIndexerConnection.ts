import { useQuery } from '@tanstack/react-query'
import { indexerHealthService } from '@/services/indexer/IndexerHealthService'
import { usePageVisibility } from './usePageVisibility'
import { INDEXER_CONFIG } from '@/config/supabase'

/**
 * Monitors the DAOShips indexer health status via periodic polling.
 * Pauses polling when the page is not visible.
 * Disables entirely when INDEXER_CONFIG.ENABLED is false (no Supabase credentials).
 */
export function useIndexerConnection() {
  const isVisible = usePageVisibility()

  const { data, isLoading } = useQuery({
    queryKey: ['indexerHealth'],
    queryFn: () => indexerHealthService.getStatus(),
    enabled: INDEXER_CONFIG.ENABLED,
    refetchInterval: isVisible ? 5000 : false,
  })

  return {
    status: data,
    isLoading,
    isEnabled: INDEXER_CONFIG.ENABLED,
  }
}

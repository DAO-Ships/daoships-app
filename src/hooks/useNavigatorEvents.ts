import { useQuery } from '@tanstack/react-query'
import { navigatorIndexerService } from '@/services/indexer/NavigatorIndexerService'

/**
 * Fetches navigator events (onboard actions) from ds_navigator_events.
 * Returns event history for a specific navigator within a DAO.
 */
export function useNavigatorEvents(daoId: string | undefined, navigatorAddress: string | undefined) {
  return useQuery({
    queryKey: ['navigatorEvents', daoId, navigatorAddress],
    queryFn: () => navigatorIndexerService.getNavigatorEvents(daoId!, navigatorAddress!),
    enabled: !!(daoId && navigatorAddress),
    staleTime: 30_000,
  })
}

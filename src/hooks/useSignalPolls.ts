import { useQuery } from '@tanstack/react-query'
import { navigatorIndexerService } from '@/services/indexer/NavigatorIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a SignalNavigator's polls from the indexer (ds_signal_polls).
 * Polls every 30 seconds when the page is visible (no realtime subscription yet).
 *
 * Rows exist only for SANCTIONED navigators — a self_asserted navigator returns [] by design.
 */
export function useSignalPolls(daoId: string | undefined, navigatorAddress: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['signalPolls', daoId, navigatorAddress?.toLowerCase()],
    queryFn: () => navigatorIndexerService.listSignalPolls(daoId!, navigatorAddress!),
    enabled: !!daoId && !!navigatorAddress,
    refetchInterval: isVisible ? 30000 : false,
  })
}

import { useQuery } from '@tanstack/react-query'
import { navigatorService } from '@/services/core/NavigatorService'
import type { NavigatorConfigResult } from '@/services/core/NavigatorService'

/**
 * Detects the navigator type and loads its configuration via on-chain probing.
 * Results are cached by navigator address (staleTime: 5 minutes).
 */
export function useNavigatorConfig(navigatorAddress: string | undefined) {
  return useQuery<NavigatorConfigResult>({
    queryKey: ['navigatorConfig', navigatorAddress],
    queryFn: () => navigatorService.detectAndLoadConfig(navigatorAddress!),
    enabled: !!navigatorAddress,
    staleTime: 5 * 60 * 1000,
  })
}

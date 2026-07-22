import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { navigatorService } from '@/services/core/NavigatorService'
import type { NavigatorConfigResult } from '@/services/core/NavigatorService'
import { baseService } from '@/services/core/BaseService'

/**
 * Detects the navigator type and loads its configuration via on-chain probing.
 * Results are cached by navigator address (staleTime: 5 minutes).
 */
export function useNavigatorConfig(navigatorAddress: string | undefined) {
  const queryClient = useQueryClient()
  const hasProvider = baseService.hasProvider()

  // The probe needs the wallet provider. A probe attempted while disconnected used to
  // resolve as {type:'unknown'} and stick for the full 5-minute staleTime, so the page
  // kept saying "not yet supported" long after the wallet connected. detectAndLoadConfig
  // now throws instead of resolving, and this refetches the moment a provider appears.
  useEffect(() => {
    if (hasProvider && navigatorAddress) {
      queryClient.invalidateQueries({ queryKey: ['navigatorConfig', navigatorAddress] })
    }
  }, [hasProvider, navigatorAddress, queryClient])

  return useQuery<NavigatorConfigResult>({
    queryKey: ['navigatorConfig', navigatorAddress],
    queryFn: () => navigatorService.detectAndLoadConfig(navigatorAddress!),
    enabled: !!navigatorAddress,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

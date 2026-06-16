import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches a single DAO member by DAO id and member address.
 * Polls every 15 seconds when the page is visible.
 * Disabled when either daoId or address is missing.
 */
export function useMember(daoId: string | undefined, address: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['member', daoId, address],
    queryFn: () => daoService.getMember(daoId!, address!),
    enabled: !!daoId && !!address,
    staleTime: 12000,
    refetchInterval: isVisible ? 15000 : false,
  })
}

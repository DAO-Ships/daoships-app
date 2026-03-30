import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches treasury (guild token) data for a specific DAO.
 * Polls every 30 seconds when the page is visible.
 * Disabled when no daoId is provided.
 */
export function useTreasury(daoId: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['treasury', daoId],
    queryFn: () => daoService.getGuildTokens(daoId!),
    enabled: !!daoId,
    refetchInterval: isVisible ? 30000 : false,
  })
}

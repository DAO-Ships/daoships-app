import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { usePageVisibility } from './usePageVisibility'

/**
 * Fetches the navigator list for a specific DAO.
 * Polls every 30 seconds when the page is visible.
 * Disabled when no daoId is provided.
 */
export function useNavigators(daoId: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['navigators', daoId],
    queryFn: () => daoService.getNavigators(daoId!),
    enabled: !!daoId,
    refetchInterval: isVisible ? 30000 : false,
  })
}

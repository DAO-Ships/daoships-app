import { useQuery } from '@tanstack/react-query'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { usePageVisibility } from './usePageVisibility'
import { useWallet } from './useWallet'

/**
 * Fetches DAOs where the connected wallet address is a member.
 * Disabled when no wallet is connected.
 * Polls every 30 seconds when the page is visible.
 */
export function useUserDaos() {
  const { address } = useWallet()
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['userDaos', address],
    queryFn: () => daoIndexerService.getDaosByMember(address!),
    enabled: !!address,
    refetchInterval: isVisible ? 30000 : false,
  })
}

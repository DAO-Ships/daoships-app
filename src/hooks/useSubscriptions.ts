import { useQuery } from '@tanstack/react-query'
import { subscriptionIndexerService } from '@/services/indexer/SubscriptionIndexerService'
import { usePageVisibility } from './usePageVisibility'

/**
 * A SubscriptionNavigator's members (ds_subscription_members), soonest-to-lapse first.
 * Polls every 30s when visible (status is time-derived, so the list re-evaluates locally).
 */
export function useSubscriptionMembers(daoId: string | undefined, navigatorAddress: string | undefined) {
  const isVisible = usePageVisibility()

  return useQuery({
    queryKey: ['subscriptionMembers', daoId, navigatorAddress?.toLowerCase()],
    queryFn: () => subscriptionIndexerService.listMembers(daoId!, navigatorAddress!),
    enabled: !!daoId && !!navigatorAddress,
    refetchInterval: isVisible ? 30000 : false,
  })
}

/** One member's subscription row (their own status). */
export function useSubscriptionMember(navigatorAddress: string | undefined, member: string | undefined) {
  return useQuery({
    queryKey: ['subscriptionMember', navigatorAddress?.toLowerCase(), member?.toLowerCase()],
    queryFn: () => subscriptionIndexerService.getMember(navigatorAddress!, member!),
    enabled: !!navigatorAddress && !!member,
    staleTime: 15_000,
  })
}

/** A member's payment history (dues feed). */
export function useSubscriptionPayments(navigatorAddress: string | undefined, member: string | undefined) {
  return useQuery({
    queryKey: ['subscriptionPayments', navigatorAddress?.toLowerCase(), member?.toLowerCase()],
    queryFn: () => subscriptionIndexerService.listPayments(navigatorAddress!, member!),
    enabled: !!navigatorAddress && !!member,
    staleTime: 30_000,
  })
}

/** A navigator's collection feed (all keeper removals). */
export function useSubscriptionCollections(navigatorAddress: string | undefined) {
  return useQuery({
    queryKey: ['subscriptionCollections', navigatorAddress?.toLowerCase()],
    queryFn: () => subscriptionIndexerService.listCollections(navigatorAddress!),
    enabled: !!navigatorAddress,
    staleTime: 30_000,
  })
}

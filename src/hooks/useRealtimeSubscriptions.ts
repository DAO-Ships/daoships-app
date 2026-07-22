import { useRealtimeTable } from './useRealtimeTable'

/**
 * Realtime for a DAO's subscription roster.
 *
 * The unparameterised keys are prefixes on purpose — React Query matches by prefix, so
 * every per-navigator and per-member variant is caught.
 */
export function useRealtimeSubscriptions(daoId: string | undefined) {
  useRealtimeTable({
    channel: `subscriptionMembers:${daoId}`,
    table: 'ds_subscription_members',
    filter: daoId ? `dao_id=eq.${daoId}` : '',
    queryKeys: [
      ['subscriptionMembers', daoId],
      ['subscriptionMember'],
      ['subscriptionPayments'],
      ['subscriptionCollections'],
    ],
    enabled: !!daoId,
  })
}

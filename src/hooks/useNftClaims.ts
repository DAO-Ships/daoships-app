import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { navigatorIndexerService } from '@/services/indexer/NavigatorIndexerService'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'

/**
 * Fetches per-token NFT claims for an NFTGatedNavigator from ds_nft_claims, and
 * subscribes to realtime changes so the claimed-tokens gallery stays live.
 *
 * Listens for `*` (INSERT | UPDATE | DELETE) so reorg tombstones (DELETE) drop
 * claims that were rolled back — mirroring useRealtimeRecords.
 */
export function useNftClaims(daoId: string | undefined, navigatorAddress: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['nftClaims', daoId, navigatorAddress],
    queryFn: () => navigatorIndexerService.getNftClaims(daoId!, navigatorAddress!),
    enabled: !!(daoId && navigatorAddress),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!supabase || !daoId || !navigatorAddress) return
    const client = supabase
    const normalized = navigatorAddress.toLowerCase()

    const channel = client
      .channel(`nft_claims:${daoId}:${normalized}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT | UPDATE | DELETE — DELETE fires on reorg tombstones
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table: 'ds_nft_claims',
          filter: `navigator_address=eq.${normalized}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['nftClaims', daoId, navigatorAddress] })
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [daoId, navigatorAddress, queryClient])

  return query
}

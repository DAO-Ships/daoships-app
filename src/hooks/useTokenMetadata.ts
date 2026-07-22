import { useQuery } from '@tanstack/react-query'
import { useProviderReady } from './useProviderReady'
import { fetchTokenMetadata, type TokenMetadata } from '@/utils/tokenMetadata'

// ═══════════════════════════════════════════════════════════════════════════
// useTokenMetadata — resolve an ERC-20's symbol / name / decimals on demand
// ───────────────────────────────────────────────────────────────────────────
// Thin React Query wrapper over the shared (cached) fetchTokenMetadata. Disabled for
// empty addresses and when no provider is connected (callers fall back to the address).
// ═══════════════════════════════════════════════════════════════════════════

export type { TokenMetadata }

export function useTokenMetadata(tokenAddress: string | undefined | null) {
  const providerReady = useProviderReady()
  const hasProvider = providerReady

  return useQuery<TokenMetadata>({
    queryKey: ['tokenMetadata', tokenAddress?.toLowerCase()],
    queryFn: () => fetchTokenMetadata(tokenAddress!),
    enabled: !!tokenAddress && hasProvider,
    staleTime: Infinity,
    retry: 1,
  })
}

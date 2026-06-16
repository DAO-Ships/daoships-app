import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'

// ═══════════════════════════════════════════════════════════════════════════
// tokenMetadata — single cached ERC-20 metadata fetcher (symbol/name/decimals)
// ───────────────────────────────────────────────────────────────────────────
// Reads go through the wallet provider (baseService), never a direct JsonRpcProvider.
// Metadata is immutable per token, so it's cached indefinitely (module Map, LRU-evicted).
// Shared by useTokenMetadata (React Query) and useTreasuryBalances (batched balances).
// ═══════════════════════════════════════════════════════════════════════════

export interface TokenMetadata {
  symbol: string
  name: string
  decimals: number
}

const ERC20_METADATA_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
]

const MAX_METADATA_CACHE = 100
const metadataCache = new Map<string, TokenMetadata>()

/** Fetch (and cache) an ERC-20's symbol/name/decimals. Name falls back to symbol. */
export async function fetchTokenMetadata(tokenAddr: string): Promise<TokenMetadata> {
  const key = tokenAddr.toLowerCase()
  const cached = metadataCache.get(key)
  if (cached) return cached

  const token = new quais.Contract(quais.getAddress(tokenAddr), ERC20_METADATA_ABI, baseService.getProvider())
  const [symbol, decimals] = await Promise.all([
    token.symbol() as Promise<string>,
    token.decimals().then((d: unknown) => Number(d)),
  ])
  let name = symbol
  try {
    name = (await token.name()) as string
  } catch {
    /* optional — fall back to symbol */
  }

  const meta: TokenMetadata = { symbol, name, decimals }
  // Evict the oldest entry if the cache is full.
  if (metadataCache.size >= MAX_METADATA_CACHE && !metadataCache.has(key)) {
    const oldest = metadataCache.keys().next().value
    if (oldest) metadataCache.delete(oldest)
  }
  metadataCache.set(key, meta)
  return meta
}

import { useQuery } from '@tanstack/react-query'
import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { usePageVisibility } from './usePageVisibility'
import { NETWORK_CONFIG, NATIVE_TOKEN_SENTINEL } from '@/config/contracts'
import { ZERO_ADDRESS } from '@/config/contracts'
import type { GuildToken } from '@/types'

const ERC20_READ_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
]

export interface TokenBalance {
  address: string
  balance: bigint
  symbol: string
  name: string
  decimals: number
  isNative: boolean
}

export interface TreasuryBalances {
  nativeBalance: bigint
  tokenBalances: TokenBalance[]
}

function isNativeToken(address: string): boolean {
  const lower = address.toLowerCase()
  return lower === ZERO_ADDRESS || lower === NATIVE_TOKEN_SENTINEL.toLowerCase()
}

// Cache token metadata (symbol, name, decimals) — these never change for a given address.
// Capped at 100 entries; oldest evicted on overflow.
const MAX_METADATA_CACHE = 100
const metadataCache = new Map<string, { symbol: string; name: string; decimals: number }>()

async function getTokenMetadata(tokenAddr: string): Promise<{ symbol: string; name: string; decimals: number }> {
  const cached = metadataCache.get(tokenAddr.toLowerCase())
  if (cached) return cached

  const token = new quais.Contract(tokenAddr, ERC20_READ_ABI, baseService.getProvider())
  const [symbol, decimals] = await Promise.all([
    token.symbol() as Promise<string>,
    token.decimals().then((d: any) => Number(d)),
  ])
  let name = symbol
  try {
    name = await token.name() as string
  } catch { /* use symbol */ }

  const meta = { symbol, name, decimals }
  const key = tokenAddr.toLowerCase()
  // Evict oldest entry if cache is full
  if (metadataCache.size >= MAX_METADATA_CACHE && !metadataCache.has(key)) {
    const oldest = metadataCache.keys().next().value!
    metadataCache.delete(oldest)
  }
  metadataCache.set(key, meta)
  return meta
}

/**
 * Fetches ERC-20 balances (via TokenService) and native QUAI balance
 * for the DAO vault address. Polls every 30 seconds when visible.
 *
 * Optimizations:
 * - Token metadata (symbol, name, decimals) is cached — only fetched once per token
 * - All balance reads and metadata fetches run in parallel
 * - Native balance and ERC-20 balances are fetched concurrently
 */
export function useTreasuryBalances(
  vaultAddress: string | undefined,
  guildTokens: GuildToken[] | undefined,
) {
  const isVisible = usePageVisibility()
  const hasWalletProvider = baseService.hasProvider()

  return useQuery<TreasuryBalances>({
    queryKey: ['treasuryBalances', vaultAddress, hasWalletProvider, guildTokens?.length ?? 0],
    queryFn: async () => {
      const provider = baseService.getProvider()
      const checksummed = quais.getAddress(vaultAddress!)
      const tokens = (guildTokens ?? []).filter((t) => t.enabled)

      // Split tokens into native and ERC-20
      const erc20Tokens = tokens.filter((t) => !isNativeToken(t.token_address))

      // Fetch native balance + all ERC-20 data in parallel
      const [nativeBalance, ...erc20Results] = await Promise.all([
        provider.getBalance(checksummed),
        ...erc20Tokens.map(async (token): Promise<TokenBalance> => {
          try {
            const tokenAddr = quais.getAddress(token.token_address)
            const tokenContract = new quais.Contract(tokenAddr, ERC20_READ_ABI, provider)

            const [rawBalance, meta] = await Promise.all([
              tokenContract.balanceOf(checksummed) as Promise<bigint>,
              getTokenMetadata(tokenAddr),
            ])
            return {
              address: token.token_address,
              balance: rawBalance,
              symbol: meta.symbol,
              name: meta.name,
              decimals: meta.decimals,
              isNative: false,
            }
          } catch (err) {
            console.warn('[useTreasuryBalances] Failed to fetch ERC-20 balance:', token.token_address, err)
            return { address: token.token_address, balance: 0n, symbol: '???', name: 'Unknown Token', decimals: 18, isNative: false }
          }
        }),
      ])

      // Build native token entries
      const nativeTokens: TokenBalance[] = tokens
        .filter((t) => isNativeToken(t.token_address))
        .map((t) => ({
          address: t.token_address,
          balance: nativeBalance,
          symbol: NETWORK_CONFIG.nativeCurrency.symbol,
          name: NETWORK_CONFIG.nativeCurrency.name,
          decimals: NETWORK_CONFIG.nativeCurrency.decimals,
          isNative: true,
        }))

      // Preserve original token order
      const erc20Map = new Map(erc20Results.map((r) => [r.address.toLowerCase(), r]))
      const tokenBalances = tokens.map((t) => {
        if (isNativeToken(t.token_address)) {
          return nativeTokens[0]
        }
        return erc20Map.get(t.token_address.toLowerCase()) ?? {
          address: t.token_address, balance: 0n, symbol: '???', name: 'Unknown Token', decimals: 18, isNative: false,
        }
      })

      return { nativeBalance, tokenBalances }
    },
    enabled: !!vaultAddress && hasWalletProvider,
    refetchInterval: isVisible ? 30000 : false,
  })
}

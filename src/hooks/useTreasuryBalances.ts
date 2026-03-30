import { useQuery } from '@tanstack/react-query'
import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { tokenService } from '@/services/core/TokenService'
import { usePageVisibility } from './usePageVisibility'
import { NETWORK_CONFIG, NATIVE_TOKEN_SENTINEL } from '@/config/contracts'
import type { GuildToken } from '@/types'

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function isNativeToken(address: string): boolean {
  const lower = address.toLowerCase()
  return lower === ZERO_ADDRESS || lower === NATIVE_TOKEN_SENTINEL.toLowerCase()
}

/**
 * Fetches ERC-20 balances (via TokenService) and native QUAI balance
 * for the DAO vault address. Polls every 30 seconds when visible.
 *
 * Handles native token guild tokens (address(0) or 0xEeee...EEeE sentinel)
 * by using provider.getBalance instead of ERC-20 calls.
 */
export function useTreasuryBalances(
  vaultAddress: string | undefined,
  guildTokens: GuildToken[] | undefined,
) {
  const isVisible = usePageVisibility()

  return useQuery<TreasuryBalances>({
    queryKey: ['treasuryBalances', vaultAddress],
    queryFn: async () => {
      const provider = baseService.getProvider()
      const checksummed = quais.getAddress(vaultAddress!)

      // Fetch native QUAI balance (always, regardless of guild tokens)
      const nativeBalance = await provider.getBalance(checksummed)

      const tokens = guildTokens ?? []
      const tokenBalances: TokenBalance[] = await Promise.all(
        tokens.map(async (token): Promise<TokenBalance> => {
          // Native token — use provider.getBalance, not ERC-20 calls
          if (isNativeToken(token.token_address)) {
            return {
              address: token.token_address,
              balance: nativeBalance,
              symbol: NETWORK_CONFIG.nativeCurrency.symbol,
              name: NETWORK_CONFIG.nativeCurrency.name,
              decimals: NETWORK_CONFIG.nativeCurrency.decimals,
              isNative: true,
            }
          }

          // ERC-20 token
          try {
            const [rawBalance, symbol, decimals] = await Promise.all([
              tokenService.getBalance(token.token_address, checksummed),
              tokenService.getSymbol(token.token_address),
              tokenService.getDecimals(token.token_address),
            ])
            // Try to get name, fall back to symbol
            let name = symbol
            try {
              name = await tokenService.getName(token.token_address)
            } catch { /* use symbol */ }

            return { address: token.token_address, balance: rawBalance, symbol, name, decimals, isNative: false }
          } catch {
            return { address: token.token_address, balance: 0n, symbol: '???', name: 'Unknown Token', decimals: 18, isNative: false }
          }
        }),
      )

      return { nativeBalance, tokenBalances }
    },
    enabled: !!vaultAddress,
    refetchInterval: isVisible ? 30000 : false,
  })
}

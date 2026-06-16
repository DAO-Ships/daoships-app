// ═══════════════════════════════════════════════════════════════════════════
// Contract & Network Configuration
// ═══════════════════════════════════════════════════════════════════════════
//
// All values are sourced from environment variables (import.meta.env).
// Default addresses come from the daoships-contracts deployment-addresses.json
// for the cyprus1 network (chain ID 15000).
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { isAddress } from '@/services/utils/AddressUtils'

// ── Protocol Constants ────────────────────────────────────────────────────

/** Max guild tokens per DAO (contract hard limit — ragequit reverts above this). */
export const MAX_GUILD_TOKENS = 20

// ── Network Configuration ─────────────────────────────────────────────────

export interface NetworkConfig {
  chainId: number
  chainName: string
  rpcUrl: string
  blockExplorerUrl: string
  quaiVaultUrl: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
}

export const NETWORK_CONFIG: NetworkConfig = {
  chainId: parseInt(import.meta.env.VITE_CHAIN_ID || '15000', 10),
  chainName: import.meta.env.VITE_CHAIN_NAME || 'Orchard Testnet',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://rpc.cyprus1.colosseum.quai.network',
  blockExplorerUrl: import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://cyprus1.colosseum.quaiscan.io',
  quaiVaultUrl: (import.meta.env.VITE_QUAIVAULT_URL as string) || 'https://testnet.quaivault.org',
  nativeCurrency: {
    name: 'Quai',
    symbol: 'QUAI',
    decimals: 18,
  },
}

// ── Zero Address ─────────────────────────────────────────────────────────

/** The zero address (0x000...000). Use for null-address checks and sentinel values. */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// ── Native Token Sentinel ─────────────────────────────────────────────────

/**
 * Sentinel address representing the native network token (QUAI) in guild token arrays.
 * Used by the DAOShip contract to distinguish native token ragequit claims from ERC-20s.
 * Changed from 0xEee...EEE to address(0) in the hardened contract deployment.
 */
export const NATIVE_TOKEN_SENTINEL = '0x0000000000000000000000000000000000000000'

// ── Contract Addresses ────────────────────────────────────────────────────

export interface ContractAddresses {
  // Singletons (logic contracts)
  DAOSHIP_SINGLETON: string
  SHARES_SINGLETON: string
  LOOT_SINGLETON: string
  VAULT_SINGLETON: string

  // Factories
  DAOSHIP_LAUNCHER: string
  DAOSHIP_AND_VAULT_LAUNCHER: string
  QUAIVAULT_FACTORY: string

  // Infrastructure
  POSTER: string
  MULTISEND_CALL_ONLY: string
}

/**
 * Contract addresses from deployment-addresses.json.
 * Environment variables override the defaults.
 */
export const CONTRACT_ADDRESSES: ContractAddresses = {
  // Singletons
  DAOSHIP_SINGLETON:
    import.meta.env.VITE_DAOSHIP_SINGLETON || '0x0034B574bDC240d37b6F08248Ae069727164002C',
  SHARES_SINGLETON:
    import.meta.env.VITE_SHARES_SINGLETON || '0x00366CedcB0B99A9E5Dfb9B7dE1484A895118235',
  LOOT_SINGLETON:
    import.meta.env.VITE_LOOT_SINGLETON || '0x00521258bBD3B23Bc10c3Fc77d360Df4379dE054',
  VAULT_SINGLETON:
    import.meta.env.VITE_VAULT_SINGLETON || '0x004E539Cf477A5Cb456A56023f083cD91Bc4934e',

  // Factories
  DAOSHIP_LAUNCHER:
    import.meta.env.VITE_DAOSHIP_LAUNCHER || '0x00487182EA7a7881d84C63099001B0195a41BFB3',
  DAOSHIP_AND_VAULT_LAUNCHER:
    import.meta.env.VITE_DAOSHIP_AND_VAULT_LAUNCHER || '0x0036B11eEC6aa17407b0e157fA9caa32b7EFC9D1',
  QUAIVAULT_FACTORY:
    import.meta.env.VITE_QUAIVAULT_FACTORY || '0x002d1305D597c157bB975967FA2e5337674b0E5F',

  // Infrastructure
  POSTER:
    import.meta.env.VITE_POSTER || '0x005C3957b8f612BBcdCFCbeDb8C53C3d3b3FEEdc',
  MULTISEND_CALL_ONLY:
    import.meta.env.VITE_MULTISEND_CALL_ONLY || '0x002ae8A47C2da497fe569AfCF0486410aA1093E0',
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Validates that all contract addresses are present and logs warnings
 * for any missing addresses. Call this once at app startup.
 */
export function validateContractConfig(): boolean {
  let valid = true
  const entries = Object.entries(CONTRACT_ADDRESSES) as [keyof ContractAddresses, string][]

  for (const [name, address] of entries) {
    if (!address) {
      console.warn(`[contracts] Missing address for ${name}. Set VITE_${name} in .env`)
      valid = false
    } else if (!isAddress(address)) {
      console.warn(`[contracts] Invalid address format for ${name}: ${address}`)
      valid = false
    }
  }

  if (!NETWORK_CONFIG.rpcUrl) {
    console.warn('[contracts] Missing RPC URL. Set VITE_RPC_URL in .env')
    valid = false
  }

  if (!valid && import.meta.env.PROD) {
    throw new Error('[contracts] Invalid contract configuration in production build. Check VITE_* env vars.')
  }

  return valid
}

/** EIP-1193 provider shape (Pelagus, MetaMask, WalletConnect) — wallet-level RPC. */
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/**
 * Verifies each configured contract address actually has bytecode deployed.
 * Must be called AFTER wallet connection (uses the wallet provider, not direct RPC).
 *
 * Bypasses quais.BrowserProvider.getCode (which silently returns '0x' for every
 * lookup against Pelagus on Quai testnets) and calls quai_getCode directly via
 * EIP-1193. Falls back to eth_getCode for non-Quai wallets.
 *
 * Returns a list of missing contracts (empty = all good).
 */
export async function verifyContractDeployments(
  rawProvider: Eip1193Provider,
): Promise<Array<{ name: keyof ContractAddresses; address: string }>> {
  const missing: Array<{ name: keyof ContractAddresses; address: string }> = []
  const entries = Object.entries(CONTRACT_ADDRESSES) as [keyof ContractAddresses, string][]

  async function getCodeRaw(address: string): Promise<string> {
    try {
      const code = await rawProvider.request({ method: 'quai_getCode', params: [address, 'latest'] })
      return typeof code === 'string' ? code : '0x'
    } catch {
      const code = await rawProvider.request({ method: 'eth_getCode', params: [address, 'latest'] })
      return typeof code === 'string' ? code : '0x'
    }
  }

  await Promise.all(
    entries.map(async ([name, address]) => {
      try {
        const checksummed = quais.getAddress(address)
        const code = await getCodeRaw(checksummed)
        const empty = !code || code === '0x' || code.length <= 2
        console.debug(`[contracts] ${name} ${address} → code.length=${code?.length ?? 0} empty=${empty}`)
        if (empty) {
          missing.push({ name, address })
        }
      } catch (err) {
        console.warn(`[contracts] Failed to verify ${name} at ${address}:`, err)
        missing.push({ name, address })
      }
    }),
  )

  if (missing.length > 0) {
    console.error(
      '[contracts] Missing or invalid contract deployments:',
      missing.map((m) => `${m.name}=${m.address}`).join(', '),
    )
  }

  return missing
}

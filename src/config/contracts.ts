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
import { getDeployment, SUPPORTED_CHAIN_IDS } from './deployments'

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

const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '15000', 10)

/** Quai mainnet is chain 9; anything else (15000 = Orchard) is a test network. */
export const IS_MAINNET = CHAIN_ID === 9

/**
 * Verified deployment for the configured chain. Undefined for an unrecognised
 * VITE_CHAIN_ID — validateContractConfig() turns that into a hard failure in PROD.
 */
const DEPLOYMENT = getDeployment(CHAIN_ID)

export const NETWORK_CONFIG: NetworkConfig = {
  chainId: CHAIN_ID,
  chainName: import.meta.env.VITE_CHAIN_NAME || DEPLOYMENT?.chainName || `Chain ${CHAIN_ID}`,
  // Shard path is mandatory on Quai — the bare host 404s.
  rpcUrl: import.meta.env.VITE_RPC_URL || DEPLOYMENT?.rpcUrl || '',
  blockExplorerUrl: import.meta.env.VITE_BLOCK_EXPLORER_URL || DEPLOYMENT?.blockExplorerUrl || '',
  quaiVaultUrl: (import.meta.env.VITE_QUAIVAULT_URL as string)
    || (IS_MAINNET ? 'https://quaivault.org' : 'https://testnet.quaivault.org'),
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
/**
 * Addresses for the configured chain.
 *
 * Previously every entry fell back to a hardcoded Orchard-testnet literal. Those
 * literals were correct *for Orchard*, but they meant a mainnet build with a missing
 * VITE_* var silently ran against testnet addresses that have no bytecode on chain 9 —
 * and validateContractConfig()'s PROD throw could never fire, because the fallback had
 * already substituted a checksum-valid address.
 *
 * Now the per-chain table in deployments.ts supplies the default, keyed on CHAIN_ID,
 * so a missing var yields the right address for the right network. An env override is
 * still honoured for local development against a custom deployment.
 */
const DEPLOYED = DEPLOYMENT?.contracts

export const CONTRACT_ADDRESSES: ContractAddresses = {
  // Singletons
  DAOSHIP_SINGLETON: import.meta.env.VITE_DAOSHIP_SINGLETON || DEPLOYED?.DAOSHIP_SINGLETON || '',
  SHARES_SINGLETON: import.meta.env.VITE_SHARES_SINGLETON || DEPLOYED?.SHARES_SINGLETON || '',
  LOOT_SINGLETON: import.meta.env.VITE_LOOT_SINGLETON || DEPLOYED?.LOOT_SINGLETON || '',
  VAULT_SINGLETON: import.meta.env.VITE_VAULT_SINGLETON || DEPLOYED?.VAULT_SINGLETON || '',

  // Factories
  DAOSHIP_LAUNCHER: import.meta.env.VITE_DAOSHIP_LAUNCHER || DEPLOYED?.DAOSHIP_LAUNCHER || '',
  DAOSHIP_AND_VAULT_LAUNCHER:
    import.meta.env.VITE_DAOSHIP_AND_VAULT_LAUNCHER || DEPLOYED?.DAOSHIP_AND_VAULT_LAUNCHER || '',
  QUAIVAULT_FACTORY: import.meta.env.VITE_QUAIVAULT_FACTORY || DEPLOYED?.QUAIVAULT_FACTORY || '',

  // Infrastructure
  POSTER: import.meta.env.VITE_POSTER || DEPLOYED?.POSTER || '',
  MULTISEND_CALL_ONLY:
    import.meta.env.VITE_MULTISEND_CALL_ONLY || DEPLOYED?.MULTISEND_CALL_ONLY || '',
}

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Validates that all contract addresses are present and logs warnings
 * for any missing addresses. Call this once at app startup.
 */
export function validateContractConfig(): boolean {
  let valid = true
  const entries = Object.entries(CONTRACT_ADDRESSES) as [keyof ContractAddresses, string][]

  // An unrecognised chain has no verified deployment to fall back on, so every
  // address below will be empty unless fully specified by env.
  if (!DEPLOYMENT) {
    console.warn(
      `[contracts] No deployment for chain ${CHAIN_ID}. Known chains: ${SUPPORTED_CHAIN_IDS.join(', ')}. `
      + 'Set VITE_CHAIN_ID, or supply every VITE_* contract address explicitly.',
    )
    valid = false
  }

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

  if (!NETWORK_CONFIG.blockExplorerUrl) {
    console.warn('[contracts] Missing block explorer URL — ABI-assisted calldata decoding will degrade.')
    valid = false
  }

  // A network/schema mismatch reads real rows off the wrong chain, which is worse
  // than reading none: the UI looks healthy and is entirely wrong.
  const expectedSchema = DEPLOYMENT?.supabaseSchema
  const actualSchema = import.meta.env.VITE_NETWORK_SCHEMA
  if (expectedSchema && actualSchema && actualSchema !== expectedSchema) {
    console.warn(
      `[contracts] VITE_NETWORK_SCHEMA="${actualSchema}" does not match chain ${CHAIN_ID} `
      + `(expected "${expectedSchema}"). Indexer reads would target the wrong network.`,
    )
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

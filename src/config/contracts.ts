// ═══════════════════════════════════════════════════════════════════════════
// Contract & Network Configuration
// ═══════════════════════════════════════════════════════════════════════════
//
// All values are sourced from environment variables (import.meta.env).
// Default addresses come from the daoships-contracts deployment-addresses.json
// for the cyprus1 network (chain ID 15000).
// ═══════════════════════════════════════════════════════════════════════════

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
    import.meta.env.VITE_DAOSHIP_SINGLETON || '0x001C3A866f7E0065DB4950C01D0D703E7bBb2ddd',
  SHARES_SINGLETON:
    import.meta.env.VITE_SHARES_SINGLETON || '0x00173065bF05a31180794BC85E0E4c35baD719D5',
  LOOT_SINGLETON:
    import.meta.env.VITE_LOOT_SINGLETON || '0x003c12aE6918E59D27AfF47C4E1D3e5B46BeFFE0',
  VAULT_SINGLETON:
    import.meta.env.VITE_VAULT_SINGLETON || '0x001e1c40f1B96f530eC816A68f760E34673Ee7b8',

  // Factories
  DAOSHIP_LAUNCHER:
    import.meta.env.VITE_DAOSHIP_LAUNCHER || '0x0050D3014f2BC52Ae87CD6000e83806B8b572eEE',
  DAOSHIP_AND_VAULT_LAUNCHER:
    import.meta.env.VITE_DAOSHIP_AND_VAULT_LAUNCHER || '0x006BF79F5001b5314d7537DAA027B89a50aF0e09',
  QUAIVAULT_FACTORY:
    import.meta.env.VITE_QUAIVAULT_FACTORY || '0x00233Cb4F587287aFe5c7e88b971A3a36b3ba0d6',

  // Infrastructure
  POSTER:
    import.meta.env.VITE_POSTER || '0x002D9EF06bE4f6fA5ea7eD4C026bee4d0a18e7F1',
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
    } else if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      console.warn(`[contracts] Invalid address format for ${name}: ${address}`)
      valid = false
    }
  }

  if (!NETWORK_CONFIG.rpcUrl) {
    console.warn('[contracts] Missing RPC URL. Set VITE_RPC_URL in .env')
    valid = false
  }

  return valid
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-Chain Deployment Table
//
// Plain data. No imports, no import.meta.env — so this module is readable from
// Node scripts and tests, not just the Vite browser build.
//
// Every address below was verified with quai_getCode against that chain's own RPC.
// Bytecode lengths match pairwise across the two networks, i.e. the same contract
// versions are deployed on both.
//
// PROVENANCE
//   chain 9      daoships-contracts/deployment-addresses.json (chainId "9") plus the
//                `references` block of
//                deployments/deployment-complete-cyprus1-1784667245618.json
//                (QuaiVaultFactory, MultiSendCallOnly — absent from the top-level file)
//   chain 15000  the previous hardcoded defaults in contracts.ts, which were the
//                complete and current Orchard set (not stale, as first assumed)
//
// VAULT_SINGLETON is deployed by the external QuaiVault project, not by
// daoships-contracts, and appears in no repo. It is recovered from the chain via
// QuaiVaultFactory.implementation() (selector 0x5c60da1b). Because nothing here
// controls it, it can change without a commit in any DAOShips repo — treat the value
// below as a cache and re-derive when it matters.
//
// All addresses are stored EIP-55 checksummed: the quai_* RPC namespace rejects
// non-checksummed input outright ("address has invalid checksum").
// ═══════════════════════════════════════════════════════════════════════════

export interface ChainDeployment {
  chainId: number
  chainName: string
  /** Shard path is mandatory — the bare host 404s. */
  rpcUrl: string
  blockExplorerUrl: string
  /** Supabase schema the indexer writes for this network. */
  supabaseSchema: string
  contracts: {
    DAOSHIP_SINGLETON: string
    SHARES_SINGLETON: string
    LOOT_SINGLETON: string
    VAULT_SINGLETON: string
    DAOSHIP_LAUNCHER: string
    DAOSHIP_AND_VAULT_LAUNCHER: string
    QUAIVAULT_FACTORY: string
    POSTER: string
    MULTISEND_CALL_ONLY: string
  }
}

export const QUAI_MAINNET_CHAIN_ID = 9
export const QUAI_ORCHARD_CHAIN_ID = 15000

export const DEPLOYMENTS: Record<number, ChainDeployment> = {
  [QUAI_MAINNET_CHAIN_ID]: {
    chainId: QUAI_MAINNET_CHAIN_ID,
    chainName: 'Quai Network',
    rpcUrl: 'https://rpc.quai.network/cyprus1',
    blockExplorerUrl: 'https://quaiscan.io',
    supabaseSchema: 'mainnet',
    contracts: {
      DAOSHIP_SINGLETON: '0x002956ba6223d17b67Af509bb057928299B11611',
      SHARES_SINGLETON: '0x0019d1FcdB7Aa83aCD17a5484f3246d1959d38fF',
      LOOT_SINGLETON: '0x0059458879E8f1FCA65f3068d9BC587b0Fd81286',
      VAULT_SINGLETON: '0x0038E6d84412A10CdcE41b0f62A05350023f1fb6',
      DAOSHIP_LAUNCHER: '0x001aa208480e8495067217c5238913dF1eC683d7',
      DAOSHIP_AND_VAULT_LAUNCHER: '0x0067b50Dac689d8688eF8575B82Bc663802f3AF5',
      QUAIVAULT_FACTORY: '0x003613aC5FFd45bFF7B2F0210DA2fF660908c488',
      POSTER: '0x004Db03AA2593B4885AFEFF688ca2634D1533fac',
      MULTISEND_CALL_ONLY: '0x003f62e6a7f2EB6b94345a9A41671888eC4A3ebA',
    },
  },
  [QUAI_ORCHARD_CHAIN_ID]: {
    chainId: QUAI_ORCHARD_CHAIN_ID,
    chainName: 'Orchard Testnet',
    rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
    blockExplorerUrl: 'https://orchard.quaiscan.io',
    supabaseSchema: 'testnet',
    contracts: {
      DAOSHIP_SINGLETON: '0x0034B574bDC240d37b6F08248Ae069727164002C',
      SHARES_SINGLETON: '0x00366CedcB0B99A9E5Dfb9B7dE1484A895118235',
      LOOT_SINGLETON: '0x00521258bBD3B23Bc10c3Fc77d360Df4379dE054',
      VAULT_SINGLETON: '0x004E539Cf477A5Cb456A56023f083cD91Bc4934e',
      DAOSHIP_LAUNCHER: '0x00487182EA7a7881d84C63099001B0195a41BFB3',
      DAOSHIP_AND_VAULT_LAUNCHER: '0x0036B11eEC6aa17407b0e157fA9caa32b7EFC9D1',
      QUAIVAULT_FACTORY: '0x002d1305D597c157bB975967FA2e5337674b0E5F',
      POSTER: '0x005C3957b8f612BBcdCFCbeDb8C53C3d3b3FEEdc',
      MULTISEND_CALL_ONLY: '0x002ae8A47C2da497fe569AfCF0486410aA1093E0',
    },
  },
}

/** Look up a deployment, or undefined for an unknown chain. */
export function getDeployment(chainId: number): ChainDeployment | undefined {
  return DEPLOYMENTS[chainId]
}

/** Chain IDs this app has a verified deployment for. */
export const SUPPORTED_CHAIN_IDS = Object.keys(DEPLOYMENTS).map(Number)

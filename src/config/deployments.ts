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
//   chain 15000  the runtime config of the deployed testnet.daoships.org, corroborated by
//                the `testnet` indexer schema (every DAO in it is an ERC-1167 clone of
//                DAOSHIP_SINGLETON below) and by the on-chain derivation walk from
//                DAOSHIP_AND_VAULT_LAUNCHER. Corrected 2026-07-27.
//
// DO NOT hand-assemble an Orchard set from repo files. Orchard has had at least four
// complete DAOShips deployments, all of which share the Quai Vault infrastructure
// (QUAIVAULT_FACTORY / VAULT_SINGLETON / MULTISEND_CALL_ONLY), so a mixed set looks
// two-thirds correct and still points at contracts nobody uses. This column previously
// held a retired deployment; production was correct only because Vercel env vars
// overrode it, which meant a local run without those overrides saw zero live DAOs.
//
// `npm run test:deployments` re-derives both columns from their launchers against the
// live chains. Run it whenever a redeploy happens — it is the only check that
// distinguishes the current deployment from a retired one.
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
      DAOSHIP_SINGLETON: '0x000F38Dc0B711a57086ca0bD6fa2041D8Cd9Fe03',
      SHARES_SINGLETON: '0x001a4f36ead605149A0144C771B7cbf4116753a9',
      LOOT_SINGLETON: '0x002abA2592A1111b8EcfFcA98A7f30b8de30cA58',
      VAULT_SINGLETON: '0x004E539Cf477A5Cb456A56023f083cD91Bc4934e',
      DAOSHIP_LAUNCHER: '0x005D0D996cB3f25bEC37E1827FeAfCe5AC9f7856',
      DAOSHIP_AND_VAULT_LAUNCHER: '0x0054Cb24fA412B2b276D5F73f4A7adC70f0f0Cbf',
      QUAIVAULT_FACTORY: '0x002d1305D597c157bB975967FA2e5337674b0E5F',
      POSTER: '0x0032eA61e8fF1b12A70C39696CfdA06198d2095e',
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

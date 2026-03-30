import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'
import { defineChain, type AppKitNetwork } from '@reown/appkit/networks'

const projectId = import.meta.env.VITE_WC_PROJECT_ID || ''

// Quai chains — not in viem defaults, define manually
export const quaiMainnet = defineChain({
  id: 9,
  caipNetworkId: 'eip155:9',
  chainNamespace: 'eip155',
  name: 'Quai Network',
  nativeCurrency: { decimals: 18, name: 'Quai', symbol: 'QUAI' },
  rpcUrls: {
    default: { http: ['https://rpc.quai.network'] },
  },
  blockExplorers: {
    default: { name: 'Quaiscan', url: 'https://quaiscan.io' },
  },
})

export const quaiOrchardTestnet = defineChain({
  id: 15000,
  caipNetworkId: 'eip155:15000',
  chainNamespace: 'eip155',
  name: 'Quai Network Orchard Testnet',
  nativeCurrency: { decimals: 18, name: 'Quai', symbol: 'QUAI' },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RPC_URL || 'https://rpc.orchard.quai.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Quaiscan',
      url: import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://orchard.quaiscan.io',
    },
  },
})

// Select active network based on VITE_CHAIN_ID
const chainId = Number(import.meta.env.VITE_CHAIN_ID)
const activeNetwork = chainId === 9 ? quaiMainnet : quaiOrchardTestnet
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [activeNetwork]

export const wagmiAdapter = new WagmiAdapter({
  storage: undefined,
  ssr: false,
  projectId,
  networks,
})

if (!projectId) {
  console.warn('[DAOShips] Missing VITE_WC_PROJECT_ID. WalletConnect will not work. Only Pelagus will be available.')
}

// Always initialize AppKit — the React hooks require it even without a project ID.
// Without a project ID, only injected wallets (Pelagus) will work.
createAppKit({
  adapters: [wagmiAdapter],
  projectId: projectId || 'PLACEHOLDER',
  networks,
  defaultNetwork: activeNetwork,
  metadata: {
    name: 'DAOShips',
    description: 'Decentralized governance for Quai Network',
    url: import.meta.env.VITE_SITE_URL || 'https://daoships.org',
    icons: [`${import.meta.env.VITE_SITE_URL || 'https://daoships.org'}/logos/dao_ships_helm_dark.svg`],
  },
  // Pelagus (injected) + WalletConnect QR only — Quai isn't supported by other wallets.
  // Suppress "Switch Network" dialog — Pelagus reports zone-specific chain IDs.
  allowUnsupportedChain: true,
  featuredWalletIds: [],
  includeWalletIds: ['none'],
  allWallets: 'HIDE',
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
})

export const wagmiConfig = wagmiAdapter.wagmiConfig

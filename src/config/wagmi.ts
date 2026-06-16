import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { custom, defineChain, type EIP1193Provider } from 'viem'

const projectId = import.meta.env.VITE_WC_PROJECT_ID || ''

export const quaiMainnet = defineChain({
  id: 9,
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

const chainId = Number(import.meta.env.VITE_CHAIN_ID)
const activeNetwork = chainId === 9 ? quaiMainnet : quaiOrchardTestnet

const siteUrl = import.meta.env.VITE_SITE_URL || 'https://daoships.org'

// Route wagmi reads through the injected wallet provider — direct RPC is
// CORS-blocked from the browser. Falls back to http if no injected provider.
function getTransport() {
  const injectedProvider = typeof window !== 'undefined'
    ? (window as unknown as { ethereum?: EIP1193Provider; pelagus?: EIP1193Provider }).pelagus
      ?? (window as unknown as { ethereum?: EIP1193Provider }).ethereum
    : null

  return injectedProvider
    ? custom(injectedProvider, { retryCount: 0 })
    : http()
}

const connectors = [injected({ shimDisconnect: true })]

if (projectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: 'DAOShips',
        description: 'Decentralized governance for Quai Network',
        url: siteUrl,
        icons: [`${siteUrl}/logos/dao_ships_helm_dark.svg`],
      },
    }),
  )
} else if (import.meta.env.PROD) {
  console.error('[DAOShips] Missing VITE_WC_PROJECT_ID in production build. WalletConnect will be unavailable.')
} else {
  console.warn('[DAOShips] Missing VITE_WC_PROJECT_ID. Only Pelagus (injected) will be available.')
}

export const wagmiConfig = createConfig({
  chains: [activeNetwork],
  connectors,
  transports: {
    [activeNetwork.id]: getTransport(),
  },
})

export const CONNECTOR_IDS = {
  injected: 'injected',
  walletConnect: 'walletConnect',
} as const

export const hasWalletConnect = !!projectId

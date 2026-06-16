import { create } from 'zustand'

// ═══════════════════════════════════════════════════════════════════════════
// Wallet Store - Connection + connect-modal state for Quai / Pelagus
// ═══════════════════════════════════════════════════════════════════════════
// Wagmi is the source of truth for `connected` and `address`; this store
// mirrors them so non-wagmi consumers can read connection state, and owns
// the connect-modal open state + connection error string.

interface WalletStore {
  connected: boolean
  address: string | null
  connectModalOpen: boolean
  error: string | null

  setConnected: (connected: boolean, address: string | null) => void
  setConnectModalOpen: (open: boolean) => void
  setError: (error: string | null) => void
}

const initialState = {
  connected: false,
  address: null,
  connectModalOpen: false,
  error: null,
}

export const useWalletStore = create<WalletStore>()((set) => ({
  ...initialState,

  setConnected: (connected, address) =>
    set({ connected, address }),

  setConnectModalOpen: (open) =>
    set({ connectModalOpen: open }),

  setError: (error) =>
    set({ error }),
}))

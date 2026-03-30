import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ═══════════════════════════════════════════════════════════════════════════
// Wallet Store - Manages wallet connection state for Quai / Pelagus
// ═══════════════════════════════════════════════════════════════════════════

interface WalletStore {
  // Connection state
  connected: boolean
  address: string | null
  signer: unknown | null
  provider: unknown | null
  chainId: number | null

  // Actions
  setConnected: (address: string, signer: unknown, provider: unknown, chainId: number) => void
  setDisconnected: () => void
}

const initialState = {
  connected: false,
  address: null,
  signer: null,
  provider: null,
  chainId: null,
}

export const useWalletStore = create<WalletStore>()(
  persist(
    (set) => ({
      ...initialState,

      setConnected: (address, signer, provider, chainId) =>
        set({ connected: true, address, signer, provider, chainId }),

      setDisconnected: () =>
        set(initialState),
    }),
    {
      name: 'wallet-storage',
      // Only persist the address — signer/provider are runtime objects
      partialize: (state) => ({ address: state.address }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Validate persisted address is a string or null
        if (state.address !== null && typeof state.address !== 'string') {
          state.address = null
        }
      },
    }
  )
)

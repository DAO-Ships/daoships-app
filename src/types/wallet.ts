// ═══════════════════════════════════════════════════════════════════════════
// Wallet Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full wallet connection state tracked by the wallet store/context.
 */
export interface WalletState {
  connected: boolean
  address: string | null
  signer: unknown | null
  provider: unknown | null
  chainId: number | null
}

/**
 * A connected wallet with guaranteed address and signer.
 * Used in contexts where a connection has been verified.
 */
export interface ConnectedWallet {
  address: string
  signer: unknown
}

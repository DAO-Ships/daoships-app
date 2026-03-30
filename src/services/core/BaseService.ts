import { quais } from 'quais'

// ═══════════════════════════════════════════════════════════════════════════
// BaseService - Singleton provider/signer management for Quai network
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base service providing shared JsonRpcProvider and signer management.
 * All other services import the singleton `baseService` instance to access
 * the RPC provider (for read calls) and the wallet signer (for write calls).
 *
 * The provider is created with `usePathing: true`, which is critical for
 * Quai's sharded architecture — it routes RPC requests to the correct
 * shard based on the address prefix.
 */
class BaseService {
  private provider: quais.JsonRpcProvider
  private signer: quais.Signer | null = null

  constructor() {
    const rpcUrl = import.meta.env.VITE_RPC_URL
    if (!rpcUrl) {
      throw new Error('VITE_RPC_URL environment variable is not set')
    }

    this.provider = new quais.JsonRpcProvider(
      rpcUrl,
      undefined,
      { usePathing: true }
    )
  }

  /**
   * Get the shared JsonRpcProvider instance.
   * Used by all services for read-only contract calls.
   */
  getProvider(): quais.JsonRpcProvider {
    return this.provider
  }

  /**
   * Get the current signer, or null if no wallet is connected.
   */
  getSigner(): quais.Signer | null {
    return this.signer
  }

  /**
   * Set the signer after wallet connection, or null on disconnect.
   */
  setSigner(signer: quais.Signer | null): void {
    this.signer = signer
  }

  /**
   * Check whether a signer is currently available.
   */
  hasSigner(): boolean {
    return this.signer !== null
  }

  /**
   * Get the signer, throwing if not connected.
   * Convenience for write operations that require a wallet.
   */
  requireSigner(): quais.Signer {
    if (!this.signer) {
      throw new Error('Wallet not connected. Please connect your wallet first.')
    }
    return this.signer
  }
}

export const baseService = new BaseService()

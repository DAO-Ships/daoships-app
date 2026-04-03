import { quais } from 'quais'

// ═══════════════════════════════════════════════════════════════════════════
// BaseService - Singleton provider/signer management for Quai network
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base service providing wallet-based provider and signer management.
 * All RPC calls are routed through the connected wallet's provider
 * (e.g. Pelagus extension) — direct JsonRpcProvider cannot be used
 * because the Quai RPC endpoint blocks browser CORS requests.
 *
 * Services must check `hasProvider()` before making read calls.
 * Write calls require `requireSigner()`.
 */
class BaseService {
  private signer: quais.Signer | null = null
  private walletProvider: quais.Provider | null = null

  /**
   * Get the wallet provider for read-only calls.
   * Throws if no wallet is connected — callers should gate on hasProvider().
   */
  getProvider(): quais.Provider {
    if (!this.walletProvider) {
      throw new Error('No wallet connected. Connect your wallet to interact with the blockchain.')
    }
    return this.walletProvider
  }

  /**
   * Check whether a wallet provider is available for read calls.
   */
  hasProvider(): boolean {
    return this.walletProvider !== null
  }

  /**
   * Get the current signer, or null if no wallet is connected.
   */
  getSigner(): quais.Signer | null {
    return this.signer
  }

  /**
   * Set the signer after wallet connection, or null on disconnect.
   * Captures the wallet's provider for all RPC read calls.
   */
  setSigner(signer: quais.Signer | null): void {
    this.signer = signer
    this.walletProvider = signer?.provider ?? null
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

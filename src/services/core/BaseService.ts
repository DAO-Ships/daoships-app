import { quais } from 'quais'
import { NETWORK_CONFIG } from '@/config/contracts'

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
  private chainId: number | null = null

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
   * Record the wallet's current chainId (set from the wallet hook on connect/switch).
   */
  setChainId(chainId: number | null): void {
    this.chainId = chainId
  }

  /** The wallet's current chainId, or null if not yet known. */
  getChainId(): number | null {
    return this.chainId
  }

  /**
   * Hard-block writes when the wallet is on the wrong network. Wrong-network state
   * otherwise causes silent reverts / "missing revert data" on Quai/Pelagus. Only
   * throws when the chainId is known AND mismatched — never blocks on unknown.
   */
  assertCorrectChain(): void {
    if (this.chainId != null && this.chainId !== NETWORK_CONFIG.chainId) {
      throw new Error(
        `Wrong network: your wallet is on chain ${this.chainId}, but this app requires ` +
          `${NETWORK_CONFIG.chainName} (chain ${NETWORK_CONFIG.chainId}). Switch networks and try again.`,
      )
    }
  }

  /**
   * Get the signer, throwing if not connected or on the wrong chain.
   * Convenience for write operations that require a wallet.
   */
  requireSigner(): quais.Signer {
    if (!this.signer) {
      throw new Error('Wallet not connected. Please connect your wallet first.')
    }
    this.assertCorrectChain()
    return this.signer
  }
}

export const baseService = new BaseService()

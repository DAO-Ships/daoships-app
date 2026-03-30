// ═══════════════════════════════════════════════════════════════════════════
// Transaction Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Discrete steps in a transaction lifecycle.
 */
export type TransactionStep = 'preparing' | 'signing' | 'waiting' | 'success' | 'error'

/**
 * Tracks the progress of an on-chain transaction through its lifecycle.
 */
export interface TransactionProgress {
  step: TransactionStep
  txHash?: string
  error?: string
}

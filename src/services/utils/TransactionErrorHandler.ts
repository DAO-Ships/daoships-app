// ═══════════════════════════════════════════════════════════════════════════
// Transaction Error Handler
//
// Parses blockchain / wallet errors and returns user-friendly messages.
// Follows the pattern from quaivault-frontend's errorMessages.ts.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured error information for display in the UI.
 */
export interface TransactionError {
  /** Short error title for toast headers or dialog titles */
  title: string
  /** Detailed error message */
  message: string
  /** Actionable suggestion for the user */
  suggestion: string
  /** Machine-readable error code (optional) */
  code?: string
}

/**
 * Parse a blockchain / wallet error and return a user-friendly TransactionError.
 *
 * Handles the following common cases:
 *   - User rejection (code 4001 / ACTION_REJECTED)
 *   - Insufficient funds
 *   - Gas estimation failure / execution revert
 *   - Network errors
 *   - Contract revert reasons
 *   - Generic fallback
 *
 * @param error - The raw error object from the wallet or provider
 * @returns Structured TransactionError with title, message, and suggestion
 */
export function parseTransactionError(error: unknown): TransactionError {
  // Guard against null / undefined / primitive input
  if (!error || typeof error !== 'object') {
    return {
      title: 'Error',
      message: typeof error === 'string' ? error : 'An unexpected error occurred',
      suggestion: 'Please try again. If the problem persists, check your connection and wallet settings.',
    }
  }

  const err = error as Record<string, any>

  // ── User rejection ────────────────────────────────────────────────────
  if (
    err.code === 'ACTION_REJECTED' ||
    err.code === 4001 ||
    (err.message && (
      err.message.includes('rejected') ||
      err.message.includes('denied') ||
      err.message.includes('cancelled') ||
      err.message.includes('User rejected')
    ))
  ) {
    return {
      title: 'Transaction Cancelled',
      message: 'Transaction was cancelled by the user.',
      suggestion: 'You cancelled the transaction in your wallet. No changes were made.',
      code: 'USER_REJECTED',
    }
  }

  // ── Insufficient funds ────────────────────────────────────────────────
  if (
    err.message?.includes('insufficient funds') ||
    err.message?.includes('insufficient balance') ||
    err.code === 'INSUFFICIENT_FUNDS'
  ) {
    return {
      title: 'Insufficient Funds',
      message: 'Your wallet does not have enough funds for this transaction.',
      suggestion: 'Make sure you have enough QUAI to cover the transaction amount and gas fees.',
      code: 'INSUFFICIENT_FUNDS',
    }
  }

  // ── Gas estimation failed / execution revert ──────────────────────────
  if (
    err.message?.includes('cannot estimate gas') ||
    err.message?.includes('gas required exceeds') ||
    err.message?.includes('out of gas') ||
    err.message?.includes('execution reverted') ||
    err.message?.includes('missing revert data') ||
    err.code === 'UNPREDICTABLE_GAS_LIMIT' ||
    err.code === 'CALL_EXCEPTION'
  ) {
    return {
      title: 'Transaction Would Fail',
      message: 'The transaction cannot be executed in its current state.',
      suggestion:
        'This usually means the action is invalid, has already been executed, or the contract rejected it. '
        + 'Common causes: you may not be a DAO member, the DAO may be locked while processing another proposal, '
        + 'or the proposal offering amount may not match what the DAO requires.',
      code: 'GAS_ESTIMATION_FAILED',
    }
  }

  // ── Network errors ────────────────────────────────────────────────────
  if (
    err.message?.includes('network') ||
    err.message?.includes('connection') ||
    err.message?.includes('timeout') ||
    err.code === 'NETWORK_ERROR' ||
    err.code === 'TIMEOUT'
  ) {
    return {
      title: 'Network Error',
      message: 'A network connection error occurred.',
      suggestion:
        'Please check your internet connection and try again. If the problem persists, the network may be experiencing issues.',
      code: 'NETWORK_ERROR',
    }
  }

  // ── Nonce too low (transaction replaced) ──────────────────────────────
  if (
    err.message?.includes('nonce') ||
    err.code === 'NONCE_EXPIRED'
  ) {
    return {
      title: 'Transaction Conflict',
      message: 'A transaction nonce conflict was detected.',
      suggestion:
        'Another transaction may have been submitted. Wait for pending transactions to confirm and try again.',
      code: 'NONCE_CONFLICT',
    }
  }

  // ── Contract revert with reason ───────────────────────────────────────
  if (err.reason) {
    return {
      title: 'Transaction Failed',
      message: err.reason,
      suggestion: 'The smart contract rejected this transaction. Check the error message above for details.',
      code: 'CONTRACT_REVERT',
    }
  }

  // ── Generic fallback ──────────────────────────────────────────────────
  return {
    title: 'Error',
    message: err.message || 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem persists, check your connection and wallet settings.',
  }
}

/**
 * Extract just the user-facing message from an error.
 * Convenience wrapper around parseTransactionError.
 */
export function formatTransactionError(error: unknown): string {
  return parseTransactionError(error).message
}

/**
 * Check if the error was a user rejection (wallet cancelled).
 * Useful to silently skip rejected transactions without showing error toasts.
 */
export function isUserRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as Record<string, any>
  return (
    err.code === 'ACTION_REJECTED' ||
    err.code === 4001 ||
    err.message?.includes('rejected') === true ||
    err.message?.includes('denied') === true ||
    err.message?.includes('cancelled') === true
  )
}

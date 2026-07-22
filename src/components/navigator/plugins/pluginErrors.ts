// ═══════════════════════════════════════════════════════════════════════════
// pluginErrors — contract-error → friendly-copy mapping shared by navigator plugins
// ═══════════════════════════════════════════════════════════════════════════

import { formatTransactionError, isUserRejection } from '@/services/utils/TransactionErrorHandler'

/**
 * Map a thrown contract error to friendly copy by matching the navigator's custom-error
 * names against the error message. Each plugin supplies its own ERROR_MAP; unmatched
 * errors fall through to the raw message.
 */
export function mapContractError(err: unknown, errorMap: Record<string, string>): string {
  // A deliberate wallet cancellation is not a failure and must not read like one.
  // isUserRejection existed with zero callers while every write path stringified the
  // raw error, so "user rejected the request" rendered identically to a revert.
  if (isUserRejection(err)) return 'Transaction cancelled in your wallet.'

  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(errorMap)) {
    if (msg.includes(key)) return friendly
  }
  // Fall back to the decoded message (custom-error name, revert reason, gas hint)
  // rather than the raw provider blob.
  return formatTransactionError(err)
}

// ═══════════════════════════════════════════════════════════════════════════
// classifyTxError — turn a write-path error into what the user should be told
// ───────────────────────────────────────────────────────────────────────────
// TxExecutor throws TxPendingTimeout when a broadcast transaction has not
// confirmed within the wait ceiling. That is NOT a failure — the tx is on its
// way and the indexer/realtime layer will reflect it — so the UI must frame it as
// "still confirming", not a red error. Everything else is a genuine failure.
//
// The instanceof check is primary; the name check is a fallback in case the error
// crosses a boundary that strips the prototype (it currently does not — React
// Query passes the same reference through — but this keeps the classifier robust).
// ═══════════════════════════════════════════════════════════════════════════

import { TxPendingTimeout } from '@/services/utils/TxExecutor'

export interface TxErrorInfo {
  /** True when the transaction was broadcast and may still confirm — not a failure. */
  pending: boolean
  title: string
  message: string
}

export function isPendingTimeout(err: unknown): boolean {
  return err instanceof TxPendingTimeout || (err instanceof Error && err.name === 'TxPendingTimeout')
}

export function classifyTxError(err: unknown): TxErrorInfo {
  if (isPendingTimeout(err)) {
    return {
      pending: true,
      title: 'Still confirming',
      message:
        'Your transaction was submitted and may still confirm. This page will update '
        + 'automatically once it lands — there is no need to resend it.',
    }
  }
  return {
    pending: false,
    title: 'Transaction failed',
    message: err instanceof Error ? err.message : String(err),
  }
}

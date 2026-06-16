import { useState } from 'react'
import { useIndexerConnection } from '@/hooks/useIndexerConnection'
import { formatTimeAgo } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// ReindexRequiredBanner - Warns when the indexer has flagged a deep reorg.
// Distinct from "indexer offline": the indexer is still serving queries, but
// historical member balance totals may have drifted and need an operator-
// triggered reindex. Cleared via backend (ds_indexer_state); the app cannot
// dismiss it server-side, so we only offer a per-session hide.
// ═══════════════════════════════════════════════════════════════════════════

export function ReindexRequiredBanner() {
  const { status, isEnabled } = useIndexerConnection()
  const [hidden, setHidden] = useState(false)

  if (!isEnabled || hidden || !status?.requiresFullReindex) {
    return null
  }

  const flaggedTs = status.reindexFlaggedAt ? Date.parse(status.reindexFlaggedAt) : NaN
  const flaggedAgo = Number.isFinite(flaggedTs) ? formatTimeAgo(flaggedTs) : null

  return (
    <div
      role="alert"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-200"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Indexer flagged a full reindex.</span>{' '}
          <span className="text-amber-200/80">
            Historical member balances may be stale until an operator clears the flag.
          </span>
          {(status.reindexReason || flaggedAgo) && (
            <div className="mt-1 text-xs text-amber-200/70">
              {status.reindexReason && <span title={status.reindexReason}>{status.reindexReason}</span>}
              {status.reindexReason && flaggedAgo && <span> · </span>}
              {flaggedAgo && <span>flagged {flaggedAgo}</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide reindex notice"
          className="flex-shrink-0 rounded p-1 text-amber-300/70 hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// indexerError — normalize Supabase query failures into thrown errors
// ───────────────────────────────────────────────────────────────────────────
// Indexer methods previously swallowed errors (`console.error` + `return []`),
// so React Query never entered `isError` and views showed an EMPTY state when the
// indexer was actually down. Throwing here lets `useQuery({ ... }).isError` fire so
// consumers can show a real error state (and React Query retries per its config).
//
// Note: `if (!supabase) return …` short-circuits (direct-RPC mode) and genuine
// "no rows" results (data === null from maybeSingle) are NOT errors — leave those.
// ═══════════════════════════════════════════════════════════════════════════

export function indexerError(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`)
}

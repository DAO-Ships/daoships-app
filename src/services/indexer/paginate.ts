// ═══════════════════════════════════════════════════════════════════════════
// paginate — cursor-free page walking for PostgREST list queries
// ───────────────────────────────────────────────────────────────────────────
// `grep -rn "\.range(" src/` used to return NOTHING. Every list query was capped at
// a hardcoded .limit(N) (or unbounded), with all pagination, filtering and sorting
// done client-side over whatever that first page happened to contain.
//
// The failure mode is silent: past the cap, rows simply do not exist as far as the
// UI is concerned. A DAO's 201st proposal is not "on page 2" — it is gone, with no
// indicator that anything was dropped.
//
// This walks pages with .range() until the source is exhausted or a hard ceiling is
// reached, and reports `truncated` so callers can say so out loud rather than
// presenting a partial list as complete.
// ═══════════════════════════════════════════════════════════════════════════

/** Rows fetched per request. PostgREST's own default max is 1000. */
export const PAGE_SIZE = 500

/** Absolute ceiling across all pages, so a pathological table cannot hang the UI. */
export const MAX_ROWS = 5000

export interface PagedResult<T> {
  rows: T[]
  /** True when MAX_ROWS was hit and more rows exist upstream. */
  truncated: boolean
}

/**
 * A query builder slice that supports `.range()` and resolves to `{ data, error }`.
 * Kept structural so this works with any PostgREST builder without importing its types.
 */
export interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

/**
 * Walk every page of a query.
 *
 * @param build   Called once per page; must return a FRESH query builder — PostgREST
 *                builders are single-use, so reusing one silently returns the same page.
 * @param onError Called with the PostgREST error; must throw (see indexerError).
 */
export async function fetchAllPages<T>(
  build: () => RangeableQuery<T>,
  onError: (error: { message: string }) => never,
): Promise<PagedResult<T>> {
  const rows: T[] = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const to = Math.min(offset + PAGE_SIZE, MAX_ROWS) - 1
    const { data, error } = await build().range(offset, to)

    if (error) onError(error)

    const page = data ?? []
    rows.push(...page)

    // A short page means the source is exhausted.
    if (page.length < to - offset + 1) return { rows, truncated: false }
  }

  return { rows, truncated: true }
}

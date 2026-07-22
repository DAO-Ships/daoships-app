// ═══════════════════════════════════════════════════════════════════════════
// Shared PostgREST/Supabase test double for the indexer services.
//
// The real `supabase` client returns a chainable query builder that is itself a
// thenable — `await client.from(t).select().eq().order()` resolves to
// `{ data, error }`, and terminal helpers like `.maybeSingle()` / `.range()` do
// too. This double mirrors that shape while recording every filter so a test can
// assert WHAT was queried (e.g. that an address was lowercased before the `.eq`),
// not merely what came back.
//
// NOT a `*.test.ts` file, so vitest does not collect it as a suite.
// ═══════════════════════════════════════════════════════════════════════════

export interface QueryResult<T = unknown> {
  data: T | null
  error: { message: string } | null
}

type Filter =
  | ['select', string]
  | ['eq', string, unknown]
  | ['in', string, unknown[]]
  | ['or', string]
  | ['range', number, number]

/**
 * One `from(table)` query. Records its filter chain and resolves (as a thenable)
 * to the result configured for its table.
 */
export class MockQuery<T = unknown> implements PromiseLike<QueryResult<T>> {
  readonly filters: Filter[] = []
  readonly orders: Array<[string, { ascending?: boolean } | undefined]> = []
  limited: number | null = null
  singled = false

  constructor(
    readonly table: string,
    private readonly result: QueryResult<T>,
  ) {}

  select(cols: string): this {
    this.filters.push(['select', cols])
    return this
  }
  eq(col: string, val: unknown): this {
    this.filters.push(['eq', col, val])
    return this
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push(['in', col, vals])
    return this
  }
  or(expr: string): this {
    this.filters.push(['or', expr])
    return this
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push([col, opts])
    return this
  }
  limit(n: number): this {
    this.limited = n
    return this
  }
  range(from: number, to: number): this {
    this.filters.push(['range', from, to])
    return this
  }
  maybeSingle(): this {
    this.singled = true
    return this
  }

  then<R1 = QueryResult<T>, R2 = never>(
    onFulfilled?: ((v: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result).then(onFulfilled, onRejected)
  }

  // ── assertion helpers ────────────────────────────────────────────────────

  /** Value passed to `.eq(col, …)`, or undefined if that column was never filtered. */
  eqArg(col: string): unknown {
    const f = [...this.filters].reverse().find((x) => x[0] === 'eq' && x[1] === col)
    return f ? (f as ['eq', string, unknown])[2] : undefined
  }

  /** Argument list passed to `.in(col, …)`. */
  inArg(col: string): unknown[] | undefined {
    const f = this.filters.find((x) => x[0] === 'in' && x[1] === col)
    return f ? (f as ['in', string, unknown[]])[2] : undefined
  }

  /** Raw expression passed to `.or(…)`. */
  orArg(): string | undefined {
    const f = this.filters.find((x) => x[0] === 'or')
    return f ? (f as ['or', string])[1] : undefined
  }
}

export interface MockClient {
  from(table: string): MockQuery
  /** Every query issued through this client, in order. */
  readonly queries: MockQuery[]
}

/**
 * Build a mock client. `resultsByTable` maps a table name to the result its query
 * should resolve to; pass an array to hand successive queries of the same table
 * different results (e.g. the two-table cross-reference in `getVoteReasons`).
 * Tables with no entry resolve to an empty, error-free result.
 */
export function makeClient(
  resultsByTable: Record<string, QueryResult | QueryResult[]>,
): MockClient {
  const queues: Record<string, QueryResult[]> = {}
  for (const [table, r] of Object.entries(resultsByTable)) {
    queues[table] = Array.isArray(r) ? [...r] : [r]
  }
  const queries: MockQuery[] = []

  return {
    queries,
    from(table: string) {
      const queue = queues[table]
      const result = queue && queue.length > 0
        ? (queue.length > 1 ? queue.shift()! : queue[0])
        : { data: [], error: null }
      const q = new MockQuery(table, result)
      queries.push(q)
      return q
    },
  }
}

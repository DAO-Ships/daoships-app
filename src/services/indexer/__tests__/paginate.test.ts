import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages, PAGE_SIZE, MAX_ROWS } from '../paginate'

// ═══════════════════════════════════════════════════════════════════════════
// Before this, `grep -rn "\.range(" src/` returned NOTHING — every list query was
// capped at a hardcoded .limit(N) with client-side pagination over that one page.
// Rows past the cap did not exist as far as the UI was concerned, with no indicator
// that anything had been dropped.
// ═══════════════════════════════════════════════════════════════════════════

/** Fake PostgREST source of `total` rows that honours .range(from, to). */
function makeSource(total: number, onBuild?: () => void) {
  return () => {
    onBuild?.()
    return {
      range: (from: number, to: number) => {
        const slice = Array.from(
          { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
          (_, i) => ({ id: from + i }),
        )
        return Promise.resolve({ data: slice, error: null })
      },
    }
  }
}

const throwOnError = (e: { message: string }): never => {
  throw new Error(e.message)
}

describe('fetchAllPages', () => {
  it('returns every row when the source exceeds a single page', async () => {
    const total = PAGE_SIZE * 2 + 37
    const { rows, truncated } = await fetchAllPages(makeSource(total), throwOnError)
    expect(rows).toHaveLength(total)
    expect(truncated).toBe(false)
  })

  it('does not truncate at the old hardcoded 200-row cap', async () => {
    const { rows } = await fetchAllPages(makeSource(950), throwOnError)
    expect(rows).toHaveLength(950)
  })

  it('stops after a short page instead of querying forever', async () => {
    let builds = 0
    const { rows } = await fetchAllPages(makeSource(10, () => { builds++ }), throwOnError)
    expect(rows).toHaveLength(10)
    expect(builds).toBe(1)
  })

  it('handles an empty source', async () => {
    const { rows, truncated } = await fetchAllPages(makeSource(0), throwOnError)
    expect(rows).toEqual([])
    expect(truncated).toBe(false)
  })

  it('reports truncation at the hard ceiling rather than hiding it', async () => {
    const { rows, truncated } = await fetchAllPages(makeSource(MAX_ROWS + 500), throwOnError)
    expect(rows).toHaveLength(MAX_ROWS)
    expect(truncated).toBe(true)
  })

  it('builds a fresh query per page (PostgREST builders are single-use)', async () => {
    let builds = 0
    await fetchAllPages(makeSource(PAGE_SIZE * 3, () => { builds++ }), throwOnError)
    expect(builds).toBeGreaterThan(1)
  })

  it('propagates a query error instead of returning a partial list', async () => {
    const onError = vi.fn(throwOnError)
    const failing = () => ({
      range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    })
    await expect(fetchAllPages(failing, onError)).rejects.toThrow('boom')
    expect(onError).toHaveBeenCalledOnce()
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The service reads INDEXER_CONFIG (mutated per test) and the global fetch.
const cfg = vi.hoisted(() => ({
  value: {
    ENABLED: true,
    HEALTH_URL: 'http://localhost:8080/health',
    HEALTH_CACHE_MS: 5000,
    SUPABASE_URL: 'https://x.supabase.co',
    NETWORK_SCHEMA: 'mainnet',
    POLLING_INTERVAL: 5000,
  },
}))
vi.mock('@/config/supabase', () => ({
  get INDEXER_CONFIG() {
    return cfg.value
  },
}))

import { indexerHealthService } from '../IndexerHealthService'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  indexerHealthService.invalidateCache()
  cfg.value.ENABLED = true
  cfg.value.HEALTH_URL = 'http://localhost:8080/health'
  cfg.value.HEALTH_CACHE_MS = 5000
  vi.spyOn(Date, 'now').mockReturnValue(1_000)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getStatus — unconfigured', () => {
  it('reports unavailable without fetching when the indexer is disabled', async () => {
    cfg.value.ENABLED = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const status = await indexerHealthService.getStatus()

    expect(status.healthy).toBe(false)
    expect(status.synced).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports unavailable when the health URL is empty (e.g. prod default)', async () => {
    cfg.value.HEALTH_URL = ''
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await indexerHealthService.getStatus()).healthy).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getStatus — sync threshold', () => {
  it('is synced when healthy and fewer than 50 blocks behind', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ status: 'healthy', details: { blocksBehind: 49 } }),
    ))
    const status = await indexerHealthService.getStatus()
    expect(status.healthy).toBe(true)
    expect(status.synced).toBe(true)
    expect(status.blocksBehind).toBe(49)
  })

  it('is NOT synced at exactly 50 blocks behind', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ status: 'healthy', details: { blocksBehind: 50 } }),
    ))
    const status = await indexerHealthService.getStatus()
    expect(status.healthy).toBe(true)
    expect(status.synced).toBe(false)
  })

  it('treats a null blocksBehind as synced when healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'healthy' })))
    const status = await indexerHealthService.getStatus()
    expect(status.synced).toBe(true)
    expect(status.blocksBehind).toBeNull()
  })

  it('is never synced when the indexer is not healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ status: 'degraded', details: { blocksBehind: 1 } }),
    ))
    const status = await indexerHealthService.getStatus()
    expect(status.healthy).toBe(false)
    expect(status.synced).toBe(false)
  })
})

describe('getStatus — field precedence and reindex flags', () => {
  it('prefers nested details over top-level fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'healthy',
        blocksBehind: 999,
        currentBlock: 111,
        details: { blocksBehind: 3, currentBlock: 222, daoCount: 7 },
      }),
    ))
    const status = await indexerHealthService.getStatus()
    expect(status.blocksBehind).toBe(3)
    expect(status.currentBlock).toBe(222)
    expect(status.daoCount).toBe(7)
  })

  it('falls back to top-level fields when details are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ status: 'healthy', blocksBehind: 12, currentBlock: 500 }),
    ))
    const status = await indexerHealthService.getStatus()
    expect(status.blocksBehind).toBe(12)
    expect(status.currentBlock).toBe(500)
  })

  it('surfaces a requiresFullReindex flag with its reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'healthy',
        details: {
          blocksBehind: 0,
          requiresFullReindex: true,
          reindexReason: 'deep reorg',
          reindexFlaggedAt: '2026-07-22T00:00:00Z',
        },
      }),
    ))
    const status = await indexerHealthService.getStatus()
    expect(status.requiresFullReindex).toBe(true)
    expect(status.reindexReason).toBe('deep reorg')
    expect(status.reindexFlaggedAt).toBe('2026-07-22T00:00:00Z')
  })
})

describe('getStatus — failures', () => {
  it('reports unavailable on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 503)))
    expect((await indexerHealthService.getStatus()).healthy).toBe(false)
  })

  it('reports unavailable (no throw) when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const status = await indexerHealthService.getStatus()
    expect(status.healthy).toBe(false)
    expect(status.synced).toBe(false)
  })
})

describe('caching', () => {
  it('serves a cached result within the cache window instead of re-fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'healthy' }))
    vi.stubGlobal('fetch', fetchMock)

    await indexerHealthService.getStatus()
    await indexerHealthService.getStatus() // 0ms later — still fresh

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-fetches once the cache window has elapsed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'healthy' }))
    vi.stubGlobal('fetch', fetchMock)

    await indexerHealthService.getStatus()
    ;(Date.now as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1_000 + 6_000)
    await indexerHealthService.getStatus()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('invalidateCache forces the next call to re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'healthy' }))
    vi.stubGlobal('fetch', fetchMock)

    await indexerHealthService.getStatus()
    indexerHealthService.invalidateCache()
    await indexerHealthService.getStatus()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('isHealthy', () => {
  it('is a boolean projection of getStatus().healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'healthy' })))
    expect(await indexerHealthService.isHealthy()).toBe(true)
  })
})

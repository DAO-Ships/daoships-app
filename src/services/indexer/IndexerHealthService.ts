// ═══════════════════════════════════════════════════════════════════════════
// IndexerHealthService - Health monitoring for the DAOShips indexer
// ═══════════════════════════════════════════════════════════════════════════

import { INDEXER_CONFIG } from '@/config/supabase'

export interface HealthStatus {
  healthy: boolean
  synced: boolean
  blocksBehind: number | null
  currentBlock: number | null
  daoCount: number | null
  /** Indexer flagged that historical totals need recomputing (e.g. deep reorg). */
  requiresFullReindex: boolean
  reindexReason: string | null
  /** ISO-8601 timestamp from the indexer. */
  reindexFlaggedAt: string | null
  lastChecked: number
}

class IndexerHealthService {
  private cache: HealthStatus | null = null

  /**
   * Quick boolean check: is the DAOShips indexer healthy and reasonably synced?
   */
  async isHealthy(): Promise<boolean> {
    const status = await this.getStatus()
    return status.healthy
  }

  /**
   * Fetch the full health status, with caching.
   * Returns a cached result if it is fresher than HEALTH_CACHE_MS.
   */
  async getStatus(): Promise<HealthStatus> {
    // Return cached result if fresh
    if (this.cache && Date.now() - this.cache.lastChecked < INDEXER_CONFIG.HEALTH_CACHE_MS) {
      return this.cache
    }

    // If DAOShips indexer is not configured, return unavailable
    if (!INDEXER_CONFIG.ENABLED || !INDEXER_CONFIG.HEALTH_URL) {
      this.cache = {
        healthy: false,
        synced: false,
        blocksBehind: null,
        currentBlock: null,
        daoCount: null,
        requiresFullReindex: false,
        reindexReason: null,
        reindexFlaggedAt: null,
        lastChecked: Date.now(),
      }
      return this.cache
    }

    try {
      const response = await fetch(INDEXER_CONFIG.HEALTH_URL, {
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`)
      }

      const data = await response.json()
      const details = data.details ?? {}

      const blocksBehind: number | null = details.blocksBehind ?? data.blocksBehind ?? null
      const healthy = data.status === 'healthy'
      const synced = healthy && (blocksBehind === null || blocksBehind < 50)

      this.cache = {
        healthy,
        synced,
        blocksBehind,
        currentBlock: details.currentBlock ?? data.currentBlock ?? null,
        daoCount: details.daoCount ?? data.daoCount ?? null,
        requiresFullReindex: Boolean(details.requiresFullReindex ?? false),
        reindexReason: details.reindexReason ?? null,
        reindexFlaggedAt: details.reindexFlaggedAt ?? null,
        lastChecked: Date.now(),
      }
    } catch {
      this.cache = {
        healthy: false,
        synced: false,
        blocksBehind: null,
        currentBlock: null,
        daoCount: null,
        requiresFullReindex: false,
        reindexReason: null,
        reindexFlaggedAt: null,
        lastChecked: Date.now(),
      }
    }

    return this.cache
  }

  /**
   * Clear the cached health status so the next call re-fetches.
   */
  invalidateCache(): void {
    this.cache = null
  }
}

export const indexerHealthService = new IndexerHealthService()

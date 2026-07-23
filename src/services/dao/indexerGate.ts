// ═══════════════════════════════════════════════════════════════════════════
// Indexer availability gate + fallback logging
// ───────────────────────────────────────────────────────────────────────────
// Reads try the indexer first and fall back to on-chain. This module holds the
// cached health signal that gates that choice, plus the fallback logger. Shared by
// the DAO read sub-service and the DaoService facade (which exposes
// invalidateIndexerCache).
// ═══════════════════════════════════════════════════════════════════════════

import { INDEXER_CONFIG } from '@/config/supabase'
import { indexerHealthService } from '@/services/indexer/IndexerHealthService'

let indexerAvailableCache: boolean | null = null
let indexerCheckTimestamp = 0
let indexerCheckPromise: Promise<boolean> | null = null

export async function isIndexerAvailable(): Promise<boolean> {
  if (!INDEXER_CONFIG.ENABLED) return false

  // No health endpoint configured (the PROD default is ''): we cannot know, so do NOT
  // assume dead. Previously getStatus() cached healthy:false permanently in that case,
  // so every gated read skipped Supabase even though PostgREST was perfectly fine.
  // Supabase queries fail fast on their own; let them be the signal.
  if (!INDEXER_CONFIG.HEALTH_URL) return true

  const now = Date.now()
  if (indexerAvailableCache !== null && now - indexerCheckTimestamp < INDEXER_CONFIG.HEALTH_CACHE_MS) {
    return indexerAvailableCache
  }

  // Deduplicate concurrent calls
  if (indexerCheckPromise) return indexerCheckPromise

  indexerCheckPromise = (async () => {
    try {
      indexerAvailableCache = await indexerHealthService.isHealthy()
      indexerCheckTimestamp = Date.now()
      return indexerAvailableCache
    } catch {
      indexerAvailableCache = false
      indexerCheckTimestamp = Date.now()
      return false
    } finally {
      indexerCheckPromise = null
    }
  })()

  return indexerCheckPromise
}

/** Reset the cached health signal so the next read re-checks immediately. */
export function invalidateIndexerCache(): void {
  indexerAvailableCache = null
  indexerCheckTimestamp = 0
}

/**
 * Make a swallowed indexer read visible. These catches deliberately fall through to an
 * on-chain read — the fallback IS the legitimate answer — but logging nothing meant a
 * degraded/down indexer was completely invisible (every read silently paid the slower,
 * wallet-dependent on-chain path). The thrown error already carries the failing
 * indexer method/table via indexerError, so its message is enough context.
 */
export function logIndexerFallback(err: unknown): void {
  console.warn(
    '[DaoService] indexer read failed, using on-chain fallback:',
    err instanceof Error ? err.message : err,
  )
}

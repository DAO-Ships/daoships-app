// ═══════════════════════════════════════════════════════════════════════════
// Supabase Client & Indexer Configuration
// ═══════════════════════════════════════════════════════════════════════════
//
// Creates a nullable Supabase client. When VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY are not set, the client is null and the app
// operates in direct-RPC-only mode.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Environment Variables ─────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const NETWORK_SCHEMA = (import.meta.env.VITE_NETWORK_SCHEMA as string) || 'dev'

// ── Supabase Client ───────────────────────────────────────────────────────

/**
 * Nullable Supabase client.
 * Will be `null` if credentials are not configured (direct-RPC mode).
 */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        db: {
          // The schema is chosen at runtime (dev/testnet/mainnet). supabase-js types
          // `schema` as a static literal, so we suppress here rather than assert a
          // misleading one — the real value is whichever network schema is configured.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          schema: NETWORK_SCHEMA as any,
        },
        auth: {
          persistSession: false,
        },
      })
    : null

// ── Indexer Configuration ─────────────────────────────────────────────────

export interface IndexerConfig {
  /** Whether the indexer connection is available */
  ENABLED: boolean
  /** The Supabase project URL */
  SUPABASE_URL: string | undefined
  /** The active schema (testnet, mainnet, dev) */
  NETWORK_SCHEMA: string
  /** Polling interval in ms for live data refresh */
  POLLING_INTERVAL: number
  /** Base URL for the indexer health endpoint */
  HEALTH_URL: string
  /** How long to cache health check results (ms) */
  HEALTH_CACHE_MS: number
}

export const INDEXER_CONFIG: IndexerConfig = {
  ENABLED: !!(SUPABASE_URL && SUPABASE_ANON_KEY),
  SUPABASE_URL,
  NETWORK_SCHEMA,
  POLLING_INTERVAL: parseInt(import.meta.env.VITE_INDEXER_POLLING_INTERVAL || '5000', 10),
  HEALTH_URL: (import.meta.env.VITE_INDEXER_HEALTH_URL as string) || (import.meta.env.PROD ? '' : 'http://localhost:8080/health'),
  HEALTH_CACHE_MS: 5000,
}

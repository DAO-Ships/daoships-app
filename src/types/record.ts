// ═══════════════════════════════════════════════════════════════════════════
// Record Types - matches ds_records table (from Poster.sol)
// ═══════════════════════════════════════════════════════════════════════════

import type { TrustLevel } from './trust'

/**
 * Represents a Poster record as stored in ds_records.
 * Records are emitted by the Poster.sol contract and used for DAO metadata
 * (name, description, avatar, etc.).
 *
 * `dao_id` is nullable because pre-DAO allowlist records (posted before the
 * DAO is registered) are stored with dao_id = null and later reparented.
 */
export interface DaoRecord {
  id: string
  dao_id: string | null
  user_address: string

  created_at: string
  tx_hash: string
  block_number?: number

  tag: string
  content_type?: string
  content: string
  content_json?: Record<string, unknown> | null

  /** Indexer-computed trust level. Uppercase values matching TrustLevel. */
  trust_level?: TrustLevel
}

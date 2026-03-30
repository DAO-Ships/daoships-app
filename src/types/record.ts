// ═══════════════════════════════════════════════════════════════════════════
// Record Types - matches ds_records table (from Poster.sol)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents a Poster record as stored in ds_records.
 * Records are emitted by the Poster.sol contract and used for DAO metadata
 * (name, description, avatar, etc.).
 */
export interface DaoRecord {
  id: string
  dao_id: string
  user_address: string

  created_at: string
  tx_hash: string
  block_number?: number

  tag: string
  content_type?: string
  content: string
  content_json?: Record<string, unknown> | null

  trust_level?: string
}

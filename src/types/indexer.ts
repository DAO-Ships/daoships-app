// ═══════════════════════════════════════════════════════════════════════════
// Indexer Types - matches ds_indexer_state table
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents the indexer sync state as stored in ds_indexer_state.
 */
export interface IndexerState {
  last_block_number: number
  last_block_hash: string
  last_indexed_at: string
  chain_id: number
  is_syncing: boolean
}

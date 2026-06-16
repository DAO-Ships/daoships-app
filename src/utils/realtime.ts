// ═══════════════════════════════════════════════════════════════════════════
// Realtime Record Ordering Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A record that may have block_number and/or created_at for ordering.
 */
export interface OrderableRecord {
  block_number?: number | null
  created_at?: string | null
}

/**
 * Determine whether `incoming` is newer than `existing`.
 *
 * Compares by block_number first (higher = newer).
 * Falls back to created_at timestamp if block_number is unavailable.
 * Returns true when ordering cannot be determined (safe default: accept the update).
 *
 * @param incoming - The newer candidate record
 * @param existing - The existing record to compare against
 * @returns true if incoming is newer or ordering can't be determined
 */
export function isNewerRecord(incoming: OrderableRecord, existing: OrderableRecord): boolean {
  // Compare by block_number when both present
  if (
    incoming.block_number != null &&
    existing.block_number != null
  ) {
    return incoming.block_number > existing.block_number
  }

  // Fall back to created_at timestamp
  if (incoming.created_at && existing.created_at) {
    return new Date(incoming.created_at).getTime() > new Date(existing.created_at).getTime()
  }

  // Can't determine ordering — accept the update
  return true
}

import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase, INDEXER_CONFIG } from '@/config/supabase'
import { useDebouncedCallback } from './useDebouncedCallback'

// ═══════════════════════════════════════════════════════════════════════════
// useRealtimeTable — one Supabase realtime subscription, one set of invalidations
// ───────────────────────────────────────────────────────────────────────────
// Nine hooks were the same forty lines copy-pasted, and they had already drifted:
// only four of the nine debounced, and useRealtimeVotes invalidated a query key
// (`['votes', …]`) that no query was ever registered under, leaving that channel
// silently inert. Both classes of bug are structural — they cannot recur once the
// body exists in exactly one place.
//
// Behaviour, applied uniformly:
//   - no-op when the Supabase client is null (direct-RPC mode) or the filter is unready
//   - subscribes to ALL postgres_changes: INSERT | UPDATE | DELETE, because DELETE is
//     how the indexer emits reorg tombstones and dropping it leaves stale rows on screen
//   - invalidates once on SUBSCRIBED, to close the gap between mount and subscription
//   - ALWAYS debounces, so a vote sweep / batch enroll / tombstone wave collapses into
//     one refetch instead of N
//   - captures the client into a local const: TypeScript will not narrow an imported
//     binding across the cleanup closure
// ═══════════════════════════════════════════════════════════════════════════

export interface RealtimeTableOptions {
  /**
   * Unique channel name. Supabase multiplexes by this, so it must identify the
   * subscription (table + filter), not just the table.
   */
  channel: string
  /** Table to watch, e.g. `ds_proposals`. */
  table: string
  /** PostgREST filter, e.g. `dao_id=eq.0x…`. */
  filter: string
  /**
   * Query keys to invalidate when a row changes. Prefix keys are fine — React Query
   * matches by prefix, so `['subscriptionMember']` catches every parameterised variant.
   */
  queryKeys: QueryKey[]
  /**
   * Set false to skip subscribing (missing ids, feature disabled). Defaults to true;
   * a falsy `filter` also disables it.
   */
  enabled?: boolean
}

export function useRealtimeTable({
  channel,
  table,
  filter,
  queryKeys,
  enabled = true,
}: RealtimeTableOptions): void {
  const queryClient = useQueryClient()

  // Serialised so the debounced callback is not rebuilt on every render by a fresh
  // array identity from the caller.
  const keysSignature = JSON.stringify(queryKeys)

  const invalidate = useDebouncedCallback(() => {
    for (const queryKey of JSON.parse(keysSignature) as QueryKey[]) {
      queryClient.invalidateQueries({ queryKey })
    }
  })

  useEffect(() => {
    const client = supabase
    if (!client || !enabled || !filter) return

    const subscription = client
      .channel(channel)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: INDEXER_CONFIG.NETWORK_SCHEMA,
          table,
          filter,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidate()
      })

    return () => {
      client.removeChannel(subscription)
    }
  }, [channel, table, filter, enabled, invalidate])
}

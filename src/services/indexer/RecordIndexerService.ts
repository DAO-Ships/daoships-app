// ═══════════════════════════════════════════════════════════════════════════
// RecordIndexerService - Record/metadata queries via Supabase (ds_records)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import { fetchAllPages, MAX_ROWS } from './paginate'
import type { DaoRecord } from '@/types'
import { POSTER_TAGS } from '@/types/poster'

class RecordIndexerService {
  /**
   * Get the most recent DAO profile record.
   * Matches both 'daoships.dao.profile.initial' (posted during launch)
   * and 'daoships.dao.profile' (posted via vault governance).
   * Only returns VERIFIED or VERIFIED_INITIAL trust records.
   */
  async getDaoProfile(daoId: string): Promise<DaoRecord | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId)
      .in('tag', [POSTER_TAGS.DAO_PROFILE_INITIAL, POSTER_TAGS.DAO_PROFILE])
      .in('trust_level', ['VERIFIED', 'VERIFIED_INITIAL'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // maybeSingle returns null (not an error) when no profile exists; only real failures throw.
    if (error) indexerError('[RecordIndexerService] getDaoProfile', error)

    return (data as DaoRecord) ?? null
  }

  /**
   * Get all records for a DAO, optionally filtered by tag.
   * Ordered by creation date descending (newest first).
   */
  async getRecords(daoId: string, tag?: string): Promise<DaoRecord[]> {
    if (!supabase) return []

    let query = supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (tag) {
      query = query.eq('tag', tag)
    }

    const { data, error } = await query

    if (error) indexerError('[RecordIndexerService] getRecords', error)

    return (data as DaoRecord[]) ?? []
  }

  /**
   * Get DAO announcements. Only VERIFIED trust (vault via governance).
   * Ordered by creation date descending (newest first).
   */
  async getDaoAnnouncements(daoId: string): Promise<DaoRecord[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId)
      .eq('tag', POSTER_TAGS.DAO_ANNOUNCEMENT)
      .eq('trust_level', 'VERIFIED')
      .order('created_at', { ascending: false })

    if (error) indexerError('[RecordIndexerService] getDaoAnnouncements', error)

    return (data as DaoRecord[]) ?? []
  }

  /**
   * Get a member profile record for a specific member within a DAO.
   * Returns the most recent member profile record, or null if none exists.
   */
  async getMemberProfile(daoId: string, memberAddress: string): Promise<DaoRecord | null> {
    if (!supabase) return null

    const normalizedAddress = memberAddress.toLowerCase()

    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId)
      .eq('tag', POSTER_TAGS.MEMBER_PROFILE)
      .eq('user_address', normalizedAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) indexerError('[RecordIndexerService] getMemberProfile', error)

    return (data as DaoRecord) ?? null
  }

  /**
   * Get member profiles for all members in a DAO.
   * Returns a map of lowercase member address → most recent profile content_json.
   */
  async getMemberProfiles(daoId: string): Promise<Map<string, Record<string, unknown>>> {
    if (!supabase) return new Map()

    // Paginated: this map drives every member identity in the app, so a 200-row cap
    // silently dropped names and avatars for everyone past it in a large DAO.
    const { rows, truncated } = await fetchAllPages<{
      user_address: string | null
      content_json: Record<string, unknown> | null
    }>(
      () => supabase!
        .from('ds_records')
        .select('user_address, content_json')
        .eq('dao_id', daoId)
        .eq('tag', POSTER_TAGS.MEMBER_PROFILE)
        .order('created_at', { ascending: false }) as never,
      (error) => indexerError('[RecordIndexerService] getMemberProfiles', error),
    )
    if (truncated) {
      console.warn(
        `[RecordIndexerService] getMemberProfiles hit the ${MAX_ROWS}-row ceiling for ${daoId}; `
        + 'some member profiles will render without a name or avatar.',
      )
    }

    // Keep only the most recent profile per member
    const profiles = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      const addr = row.user_address?.toLowerCase()
      if (addr && row.content_json && !profiles.has(addr)) {
        profiles.set(addr, row.content_json as Record<string, unknown>)
      }
    }

    return profiles
  }

  /**
   * Get vote reasons for a specific proposal.
   *
   * Filters:
   * - Matches `tag === daoships.proposal.vote.reason`
   * - Matches `content_json.proposalId === proposalId`
   * - Accepts only `trust_level IN ('MEMBER', 'VERIFIED', 'VERIFIED_INITIAL')`
   *   Other trust levels (ON_CHAIN_PROVISIONAL, SEMI_TRUSTED, UNTRUSTED) are rejected
   *   because vote reasons should only come from wallet-identified shareholders.
   * - Cross-references `ds_votes` to verify the poster actually voted on this proposal.
   *   A MEMBER can post a vote reason for a proposal they never voted on — we drop
   *   those server-side so the UI never displays impersonated opinions.
   *
   * Returns records ordered by creation date descending (newest first).
   */
  async getVoteReasons(daoId: string, proposalId: number): Promise<DaoRecord[]> {
    if (!supabase) return []

    const compositeProposalId = `${daoId.toLowerCase()}-${proposalId}`

    const [recordsResult, votesResult] = await Promise.all([
      supabase
        .from('ds_records')
        .select('*')
        .eq('dao_id', daoId.toLowerCase())
        .eq('tag', POSTER_TAGS.PROPOSAL_VOTE_REASON)
        .eq('content_json->>proposalId', String(proposalId))
        .in('trust_level', ['MEMBER', 'VERIFIED', 'VERIFIED_INITIAL'])
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('ds_votes')
        .select('voter')
        .eq('proposal_id', compositeProposalId),
    ])

    if (recordsResult.error) indexerError('[RecordIndexerService] getVoteReasons', recordsResult.error)
    if (votesResult.error) {
      // Deliberate graceful degrade: the votes query is a secondary cross-reference, so a
      // failure there falls back to records-only rather than failing the whole query.
      console.warn('[RecordIndexerService] getVoteReasons votes error:', votesResult.error.message)
      return (recordsResult.data as DaoRecord[]) ?? []
    }

    const voterSet = new Set(
      ((votesResult.data ?? []) as Array<{ voter: string }>).map((v) => v.voter.toLowerCase()),
    )

    return ((recordsResult.data as DaoRecord[]) ?? []).filter(
      (r) => voterSet.has(r.user_address.toLowerCase()),
    )
  }

  /**
   * Get allowlist record for a specific navigator.
   * Returns the most recent allowlist post matching the navigator address.
   */
  async getNavigatorAllowlist(daoId: string, navigatorAddress: string): Promise<DaoRecord | null> {
    if (!supabase) return null

    // daoId is interpolated into a raw PostgREST `.or()` filter below, so it must be a
    // strict hex address — reject anything that could break out of the filter string.
    if (!/^0x[0-9a-fA-F]{40}$/.test(daoId)) {
      console.error('[RecordIndexerService] getNavigatorAllowlist: invalid daoId', daoId)
      return null
    }

    const normalizedNav = navigatorAddress.toLowerCase()

    // Include pre-DAO orphaned records (dao_id IS NULL) — these get reparented
    // by the indexer once the navigator is registered, but during the window
    // before reparenting the frontend still needs to resolve them.
    // Filter on navigatorAddress SERVER-side. Previously this took the newest 20 rows
    // and filtered client-side afterwards, so 20+ allowlist posts for this DAO evicted
    // the real record before it was ever examined — and staleTime: Infinity made the
    // miss permanent for the session. Poster tags are permissionless, so that was
    // trivially induced.
    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .or(`dao_id.eq.${daoId.toLowerCase()},dao_id.is.null`)
      .eq('tag', POSTER_TAGS.NAVIGATOR_ALLOWLIST)
      .eq('content_json->>navigatorAddress', normalizedNav)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) indexerError('[RecordIndexerService] getNavigatorAllowlist', error)

    // Defence in depth: re-check client-side in case the stored casing differs.
    const match = (data ?? []).find((r) => {
      const json = r.content_json as Record<string, unknown> | null
      return json?.navigatorAddress?.toString().toLowerCase() === normalizedNav
    })

    return (match as DaoRecord) ?? null
  }
}

export const recordIndexerService = new RecordIndexerService()

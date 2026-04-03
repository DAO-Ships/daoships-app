// ═══════════════════════════════════════════════════════════════════════════
// RecordIndexerService - Record/metadata queries via Supabase (ds_records)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
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
      .single()

    if (error) {
      // PGRST116 = "no rows returned" which is expected when no profile exists
      if (error.code !== 'PGRST116') {
        console.error('[RecordIndexerService] getDaoProfile error:', error.message)
      }
      return null
    }

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

    if (error) {
      console.error('[RecordIndexerService] getRecords error:', error.message)
      return []
    }

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

    if (error) {
      console.error('[RecordIndexerService] getDaoAnnouncements error:', error.message)
      return []
    }

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
      .single()

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('[RecordIndexerService] getMemberProfile error:', error.message)
      }
      return null
    }

    return (data as DaoRecord) ?? null
  }

  /**
   * Get member profiles for all members in a DAO.
   * Returns a map of lowercase member address → most recent profile content_json.
   */
  async getMemberProfiles(daoId: string): Promise<Map<string, Record<string, unknown>>> {
    if (!supabase) return new Map()

    const { data, error } = await supabase
      .from('ds_records')
      .select('user_address, content_json')
      .eq('dao_id', daoId)
      .eq('tag', POSTER_TAGS.MEMBER_PROFILE)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[RecordIndexerService] getMemberProfiles error:', error.message)
      return new Map()
    }

    // Keep only the most recent profile per member
    const profiles = new Map<string, Record<string, unknown>>()
    for (const row of data ?? []) {
      const addr = row.user_address?.toLowerCase()
      if (addr && row.content_json && !profiles.has(addr)) {
        profiles.set(addr, row.content_json as Record<string, unknown>)
      }
    }

    return profiles
  }

  /**
   * Get vote reasons for a specific proposal.
   * Returns records ordered by creation date descending (newest first).
   */
  async getVoteReasons(daoId: string, proposalId: number): Promise<DaoRecord[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId)
      .eq('tag', POSTER_TAGS.PROPOSAL_VOTE_REASON)
      .eq('content_json->>proposalId', String(proposalId))
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[RecordIndexerService] getVoteReasons error:', error.message)
      return []
    }

    return (data as DaoRecord[]) ?? []
  }

  /**
   * Get allowlist record for a specific navigator.
   * Returns the most recent allowlist post matching the navigator address.
   */
  async getNavigatorAllowlist(daoId: string, navigatorAddress: string): Promise<DaoRecord | null> {
    if (!supabase) return null

    const normalizedNav = navigatorAddress.toLowerCase()

    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId.toLowerCase())
      .eq('tag', POSTER_TAGS.NAVIGATOR_ALLOWLIST)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[RecordIndexerService] getNavigatorAllowlist error:', error.message)
      return null
    }

    // Filter by navigatorAddress in content_json (Supabase JSONB filtering)
    const match = (data ?? []).find((r) => {
      const json = r.content_json as Record<string, unknown> | null
      return json?.navigatorAddress?.toString().toLowerCase() === normalizedNav
    })

    return (match as DaoRecord) ?? null
  }
}

export const recordIndexerService = new RecordIndexerService()

// ═══════════════════════════════════════════════════════════════════════════
// DaoIndexerService - DAO queries via Supabase (ds_daos, ds_guild_tokens)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import type { Dao, GuildToken } from '@/types'

class DaoIndexerService {
  /**
   * List DAOs, ordered by creation date descending (newest first).
   * Optionally filter by name (server-side ilike search).
   */
  async listDaos(search?: string): Promise<Dao[]> {
    if (!supabase) return []

    let query = supabase
      .from('ds_daos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (search?.trim()) {
      const escaped = search.trim().replace(/[%_\\]/g, '\\$&')
      query = query.ilike('name', `%${escaped}%`)
    }

    const { data, error } = await query

    if (error) indexerError('[DaoIndexerService] listDaos', error)

    return (data as Dao[]) ?? []
  }

  /**
   * Get a single DAO by its contract address (id).
   */
  async getDao(id: string): Promise<Dao | null> {
    if (!supabase) return null

    // maybeSingle so a genuinely missing DAO resolves to null (not an error) — only real
    // query failures throw.
    const { data, error } = await supabase
      .from('ds_daos')
      .select('*')
      .eq('id', id.toLowerCase())
      .maybeSingle()

    if (error) indexerError('[DaoIndexerService] getDao', error)

    return (data as Dao) ?? null
  }

  /**
   * Get all DAOs that a given address is a member of.
   * Joins ds_members to find DAOs where the address has a membership record.
   */
  async getDaosByMember(address: string): Promise<Dao[]> {
    if (!supabase) return []

    const normalizedAddress = address.toLowerCase()

    // First, get all dao_ids where this address is a member
    const { data: memberRows, error: memberError } = await supabase
      .from('ds_members')
      .select('dao_id')
      .eq('member_address', normalizedAddress)

    if (memberError) indexerError('[DaoIndexerService] getDaosByMember member query', memberError)
    if (!memberRows || memberRows.length === 0) return []

    const daoIds = memberRows.map((row) => row.dao_id)

    const { data, error } = await supabase
      .from('ds_daos')
      .select('*')
      .in('id', daoIds)
      .order('created_at', { ascending: false })

    if (error) indexerError('[DaoIndexerService] getDaosByMember dao query', error)

    return (data as Dao[]) ?? []
  }

  /**
   * Get the guild tokens for a specific DAO.
   */
  async getGuildTokens(daoId: string): Promise<GuildToken[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_guild_tokens')
      .select('*')
      .eq('dao_id', daoId)

    if (error) indexerError('[DaoIndexerService] getGuildTokens', error)

    return (data as GuildToken[]) ?? []
  }
}

export const daoIndexerService = new DaoIndexerService()

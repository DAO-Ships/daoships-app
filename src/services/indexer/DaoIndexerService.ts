// ═══════════════════════════════════════════════════════════════════════════
// DaoIndexerService - DAO queries via Supabase (ds_daos, ds_guild_tokens)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
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
      query = query.ilike('name', `%${search.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[DaoIndexerService] listDaos error:', error.message)
      return []
    }

    return (data as Dao[]) ?? []
  }

  /**
   * Get a single DAO by its contract address (id).
   */
  async getDao(id: string): Promise<Dao | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('ds_daos')
      .select('*')
      .eq('id', id.toLowerCase())
      .single()

    if (error) {
      console.error('[DaoIndexerService] getDao error:', error.message)
      return null
    }

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

    if (memberError || !memberRows || memberRows.length === 0) {
      if (memberError) {
        console.error('[DaoIndexerService] getDaosByMember member query error:', memberError.message)
      }
      return []
    }

    const daoIds = memberRows.map((row) => row.dao_id)

    const { data, error } = await supabase
      .from('ds_daos')
      .select('*')
      .in('id', daoIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DaoIndexerService] getDaosByMember dao query error:', error.message)
      return []
    }

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

    if (error) {
      console.error('[DaoIndexerService] getGuildTokens error:', error.message)
      return []
    }

    return (data as GuildToken[]) ?? []
  }
}

export const daoIndexerService = new DaoIndexerService()

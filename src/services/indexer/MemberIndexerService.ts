// ═══════════════════════════════════════════════════════════════════════════
// MemberIndexerService - Member queries via Supabase (ds_members)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import type { Member } from '@/types'

class MemberIndexerService {
  /**
   * List active members for a DAO (shares > 0 or loot > 0).
   * Members who ragequit to 0/0 are kept in the DB as historical records
   * but excluded from active listings.
   */
  async listMembers(daoId: string): Promise<Member[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_members')
      .select('*')
      .eq('dao_id', daoId)
      .or('shares.gt.0,loot.gt.0')
      .order('created_at', { ascending: false })

    if (error) indexerError('[MemberIndexerService] listMembers', error)

    return (data as Member[]) ?? []
  }

  /**
   * Get a single member by DAO ID and member address.
   * Composite key format: `${daoId}-${memberAddress}`
   */
  async getMember(daoId: string, address: string): Promise<Member | null> {
    if (!supabase) return null

    const normalizedAddress = address.toLowerCase()
    const compositeKey = `${daoId}-${normalizedAddress}`

    // maybeSingle so a non-member resolves to null (the common case — every isMember check
    // relies on it) rather than throwing; only real query failures throw.
    const { data, error } = await supabase
      .from('ds_members')
      .select('*')
      .eq('id', compositeKey)
      .maybeSingle()

    if (error) indexerError('[MemberIndexerService] getMember', error)

    return (data as Member) ?? null
  }

  /**
   * Get the count of active members (those with shares > 0 or loot > 0).
   * This leverages the idx_ds_members_active partial index on the database.
   */
  async getActiveMemberCount(daoId: string): Promise<number> {
    if (!supabase) return 0

    const { count, error } = await supabase
      .from('ds_members')
      .select('*', { count: 'exact', head: true })
      .eq('dao_id', daoId)
      .or('shares.gt.0,loot.gt.0')

    if (error) indexerError('[MemberIndexerService] getActiveMemberCount', error)

    return count ?? 0
  }
}

export const memberIndexerService = new MemberIndexerService()

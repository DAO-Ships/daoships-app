// ═══════════════════════════════════════════════════════════════════════════
// NavigatorIndexerService - Navigator queries via Supabase (ds_navigators, ds_navigator_events)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import type { Navigator, NavigatorEvent } from '@/types'

class NavigatorIndexerService {
  /**
   * List all navigators for a DAO.
   * Ordered by creation date descending (newest first).
   */
  async listNavigators(daoId: string): Promise<Navigator[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_navigators')
      .select('*')
      .eq('dao_id', daoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[NavigatorIndexerService] listNavigators error:', error.message)
      return []
    }

    return (data as Navigator[]) ?? []
  }

  /**
   * List all navigator events for a DAO (all navigators).
   * Ordered by creation date descending (newest first).
   */
  async listNavigatorEvents(daoId: string): Promise<NavigatorEvent[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_navigator_events')
      .select('*')
      .eq('dao_id', daoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[NavigatorIndexerService] listNavigatorEvents error:', error.message)
      return []
    }

    return (data as NavigatorEvent[]) ?? []
  }

  /**
   * Get all events for a specific navigator within a DAO.
   * Events include onboard, checkin, and slash actions.
   * Ordered by block_number descending (newest first).
   */
  async getNavigatorEvents(daoId: string, navigatorAddress: string): Promise<NavigatorEvent[]> {
    if (!supabase) return []

    const normalizedAddress = navigatorAddress.toLowerCase()

    const { data, error } = await supabase
      .from('ds_navigator_events')
      .select('*')
      .eq('dao_id', daoId)
      .eq('navigator_address', normalizedAddress)
      .order('block_number', { ascending: false })

    if (error) {
      console.error('[NavigatorIndexerService] getNavigatorEvents error:', error.message)
      return []
    }

    return (data as NavigatorEvent[]) ?? []
  }
}

export const navigatorIndexerService = new NavigatorIndexerService()

// ═══════════════════════════════════════════════════════════════════════════
// SubscriptionIndexerService - SubscriptionNavigator queries via Supabase
// (ds_subscription_members, ds_subscription_payments, ds_subscription_collections)
// ───────────────────────────────────────────────────────────────────────────
// Permissioned MANAGER (always trust_status='sanctioned'). `total_paid` on a member is
// the indexer's derive-from-truth SUM of payments; the payment/collection feeds are
// append-only. Status is time-derived from paid_through + the immutable graceDuration.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import type {
  SubscriptionMemberRow,
  SubscriptionPaymentRow,
  SubscriptionCollectionRow,
} from '@/types'

class SubscriptionIndexerService {
  /**
   * List a navigator's subscribers (or all subscription members in the DAO), ordered
   * soonest-to-lapse first (ascending paid_through) so the delinquency queue is at the top.
   */
  async listMembers(daoId: string, navigatorAddress?: string): Promise<SubscriptionMemberRow[]> {
    if (!supabase) return []

    let query = supabase.from('ds_subscription_members').select('*').eq('dao_id', daoId)
    if (navigatorAddress) query = query.eq('navigator_address', navigatorAddress.toLowerCase())

    const { data, error } = await query.order('paid_through', { ascending: true })

    if (error) indexerError('[SubscriptionIndexerService] listMembers', error)

    return (data as SubscriptionMemberRow[]) ?? []
  }

  /**
   * Read one member's subscription row by navigator + member. Null if not enrolled / indexed.
   */
  async getMember(navigatorAddress: string, member: string): Promise<SubscriptionMemberRow | null> {
    if (!supabase) return null

    const id = `${navigatorAddress.toLowerCase()}-${member.toLowerCase()}`
    const { data, error } = await supabase
      .from('ds_subscription_members')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) indexerError('[SubscriptionIndexerService] getMember', error)

    return (data as SubscriptionMemberRow | null) ?? null
  }

  /**
   * Payment feed for one member (their dues history), newest first.
   */
  async listPayments(navigatorAddress: string, member: string): Promise<SubscriptionPaymentRow[]> {
    if (!supabase) return []

    const memberPk = `${navigatorAddress.toLowerCase()}-${member.toLowerCase()}`
    const { data, error } = await supabase
      .from('ds_subscription_payments')
      .select('*')
      .eq('member_pk', memberPk)
      .order('block_number', { ascending: false })
      .limit(25)

    if (error) indexerError('[SubscriptionIndexerService] listPayments', error)

    return (data as SubscriptionPaymentRow[]) ?? []
  }

  /**
   * Collection feed for a navigator (all keeper removals), newest first.
   */
  async listCollections(navigatorAddress: string): Promise<SubscriptionCollectionRow[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_subscription_collections')
      .select('*')
      .eq('navigator_address', navigatorAddress.toLowerCase())
      .order('block_number', { ascending: false })
      .limit(25)

    if (error) indexerError('[SubscriptionIndexerService] listCollections', error)

    return (data as SubscriptionCollectionRow[]) ?? []
  }
}

export const subscriptionIndexerService = new SubscriptionIndexerService()

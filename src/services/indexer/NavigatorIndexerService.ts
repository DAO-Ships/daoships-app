// ═══════════════════════════════════════════════════════════════════════════
// NavigatorIndexerService - Navigator queries via Supabase
// (ds_navigators, ds_navigator_events, ds_nft_claims)
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '@/config/supabase'
import { indexerError } from './indexerError'
import type { Navigator, NavigatorEvent, NftClaim, SignalPollRow, SignalVoteRow } from '@/types'

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

    if (error) indexerError('[NavigatorIndexerService] listNavigators', error)

    return (data as Navigator[]) ?? []
  }

  /**
   * List a DAO's sanctioned read-only navigators (optionally filtered by type).
   *
   * `trust_status` only meaningfully gates read-only navigators — permissioned ones are
   * always 'sanctioned' (vouched by NavigatorSet). Use this for the default poll feed where
   * only DAO-endorsed navigators (and their materialized polls) should appear.
   */
  async listSanctionedNavigators(daoId: string, navigatorType?: string): Promise<Navigator[]> {
    if (!supabase) return []

    let query = supabase
      .from('ds_navigators')
      .select('*')
      .eq('dao_id', daoId)
      .eq('trust_status', 'sanctioned')

    if (navigatorType) query = query.eq('navigator_type', navigatorType)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) indexerError('[NavigatorIndexerService] listSanctionedNavigators', error)

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

    if (error) indexerError('[NavigatorIndexerService] listNavigatorEvents', error)

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

    if (error) indexerError('[NavigatorIndexerService] getNavigatorEvents', error)

    return (data as NavigatorEvent[]) ?? []
  }

  /**
   * Get all NFT claims for a specific NFTGatedNavigator within a DAO.
   * Sourced from ds_nft_claims (the per-token claim record). Ordered newest first.
   *
   * Note: this is eventually-consistent indexed data — for the member's OWN pending
   * claim, read on-chain `claimed(tokenId)` instead (see NFTGatedPlugin).
   */
  async getNftClaims(daoId: string, navigatorAddress: string): Promise<NftClaim[]> {
    if (!supabase) return []

    const normalizedAddress = navigatorAddress.toLowerCase()

    const { data, error } = await supabase
      .from('ds_nft_claims')
      .select('*')
      .eq('dao_id', daoId)
      .eq('navigator_address', normalizedAddress)
      .order('block_number', { ascending: false })

    if (error) indexerError('[NavigatorIndexerService] getNftClaims', error)

    return (data as NftClaim[]) ?? []
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SignalNavigator polls (ds_signal_polls / ds_signal_votes)
  // Rows exist ONLY for sanctioned navigators (the indexer defers materialization).
  // `tally` is authoritative — never re-sum votes or read on-chain balances.
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * List a DAO's signal polls (across all sanctioned navigators), newest voting window first.
   * Pass `navigatorAddress` to scope to one navigator.
   */
  async listSignalPolls(daoId: string, navigatorAddress?: string): Promise<SignalPollRow[]> {
    if (!supabase) return []

    let query = supabase.from('ds_signal_polls').select('*').eq('dao_id', daoId)
    if (navigatorAddress) query = query.eq('navigator_address', navigatorAddress.toLowerCase())

    const { data, error } = await query.order('voting_starts', { ascending: false })

    if (error) indexerError('[NavigatorIndexerService] listSignalPolls', error)

    return (data as SignalPollRow[]) ?? []
  }

  /**
   * Read one poll by navigator + pollId. `tally` is the authoritative per-option result.
   */
  async getSignalPoll(navigatorAddress: string, pollId: string): Promise<SignalPollRow | null> {
    if (!supabase) return null

    const id = `${navigatorAddress.toLowerCase()}-${pollId}`
    const { data, error } = await supabase.from('ds_signal_polls').select('*').eq('id', id).maybeSingle()

    if (error) indexerError('[NavigatorIndexerService] getSignalPoll', error)

    return (data as SignalPollRow | null) ?? null
  }

  /**
   * Has a wallet voted on a poll? Returns the chosen option if so.
   */
  async hasVotedOnPoll(
    navigatorAddress: string,
    pollId: string,
    voter: string,
  ): Promise<{ voted: boolean; option?: number }> {
    if (!supabase) return { voted: false }

    const id = `${navigatorAddress.toLowerCase()}-${pollId}-${voter.toLowerCase()}`
    const { data, error } = await supabase
      .from('ds_signal_votes')
      .select('option')
      .eq('id', id)
      .maybeSingle()

    if (error) indexerError('[NavigatorIndexerService] hasVotedOnPoll', error)

    return data ? { voted: true, option: (data as { option: number }).option } : { voted: false }
  }

  /**
   * List all votes for a poll (for a voter breakdown), oldest first.
   */
  async listPollVotes(navigatorAddress: string, pollId: string): Promise<SignalVoteRow[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_signal_votes')
      .select('*')
      .eq('navigator_address', navigatorAddress.toLowerCase())
      .eq('poll_id', pollId)
      .order('created_at', { ascending: true })

    if (error) indexerError('[NavigatorIndexerService] listPollVotes', error)

    return (data as SignalVoteRow[]) ?? []
  }
}

export const navigatorIndexerService = new NavigatorIndexerService()

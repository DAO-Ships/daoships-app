// ═══════════════════════════════════════════════════════════════════════════
// DaoService - Facade for all DAO operations
// ═══════════════════════════════════════════════════════════════════════════
//
// This singleton composes core (on-chain) services and indexer (Supabase)
// services behind a unified API with a consistent fallback strategy:
//
//   Read methods:  try indexer first, fall back to on-chain RPC
//   Write methods: always go directly to chain via core services
//
// Usage:
//   import { daoService } from '@/services/DaoService'
//
//   // Reads (indexer-first with RPC fallback)
//   const dao = await daoService.getDao(daoId)
//   const proposals = await daoService.getProposals(daoId)
//
//   // Writes (always on-chain)
//   await daoService.submitProposal(daoId, proposalData, expiration, details) — offering computed on-chain
//
//   // Direct sub-service access when needed
//   const config = daoService.daoShip.getGovernanceConfig(daoId)
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { indexerHealthService } from '@/services/indexer/IndexerHealthService'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { proposalIndexerService } from '@/services/indexer/ProposalIndexerService'
import { memberIndexerService } from '@/services/indexer/MemberIndexerService'
import { voteIndexerService } from '@/services/indexer/VoteIndexerService'
import { navigatorIndexerService } from '@/services/indexer/NavigatorIndexerService'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'
import type { ProposalFilters } from '@/services/indexer/ProposalIndexerService'
import type {
  Dao,
  GuildToken,
  Proposal,
  Member,
  Vote,
  Navigator,
  NavigatorEvent,
  DaoRecord,
} from '@/types'

import {
  getDAOShipContract,
  getSharesContract,
  getLootContract,
  getERC20TributeNavigatorContract,
} from './dao/contracts'
import {
  isIndexerAvailable,
  invalidateIndexerCache as resetIndexerCache,
  logIndexerFallback,
} from './dao/indexerGate'
import { daoWriteService } from './dao/DaoWriteService'
import { launchService } from './dao/LaunchService'


// ═══════════════════════════════════════════════════════════════════════════
// DaoService class
// ═══════════════════════════════════════════════════════════════════════════

class DaoService {

  // ─────────────────────────────────────────────────────────────────────────
  // Indexer cache management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Invalidate the indexer health cache.
   * Call this when subscription errors occur to trigger an immediate re-check.
   */
  invalidateIndexerCache(): void {
    resetIndexerCache()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // READ METHODS - Indexer first, RPC fallback
  // ═════════════════════════════════════════════════════════════════════════

  // ── DAO reads ──────────────────────────────────────────────────────────

  /**
   * Get a single DAO by its DAOShip contract address.
   */
  async getDao(daoId: string): Promise<Dao | null> {
    // Query the indexer directly — do NOT gate this single-row read on the cached health
    // check. A transient health blip (slow/failed /health fetch, momentary non-"healthy"
    // status, or an unset HEALTH_URL) would otherwise route every DAO load onto the
    // wallet-dependent on-chain fallback, which throws "No wallet connected" for logged-out
    // users and surfaces as a false "DAO Not Found". The Supabase read fails fast on its own.
    try {
      const dao = await daoIndexerService.getDao(daoId)
      if (dao) return dao
    } catch (err) {
      logIndexerFallback(err)
      // Indexer unreachable — fall through to on-chain (e.g. a freshly-deployed DAO, or
      // Supabase momentarily down).
    }

    return this.getDaoFromChain(daoId)
  }

  /**
   * List all DAOs, newest first.
   */
  async getDaos(): Promise<Dao[]> {
    if (!(await isIndexerAvailable())) return []
    // There is NO on-chain equivalent for "list all DAOs", so a failure here cannot be
    // recovered — it must surface. Swallowing it rendered Home's "Calm waters ahead —
    // No DAOs have launched yet" and made Explore's `) : error ? (` branch unreachable.
    return daoIndexerService.listDaos()
  }

  /**
   * Get all DAOs that a given address is a member of.
   */
  async getDaosByMember(address: string): Promise<Dao[]> {
    if (!(await isIndexerAvailable())) return []
    // No on-chain equivalent — surface the failure rather than claiming zero memberships.
    return daoIndexerService.getDaosByMember(address)
  }

  /**
   * Get guild tokens (ragequit-eligible tokens) for a DAO.
   */
  async getGuildTokens(daoId: string): Promise<GuildToken[]> {
    if (await isIndexerAvailable()) {
      try {
        return await daoIndexerService.getGuildTokens(daoId)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through to the on-chain read below.
      }
    }

    // On-chain enumeration IS available — getGuildTokens() is in the ABI. This used
    // to `return []`, and RagequitModal rendered that empty list as a positive
    // assertion ("This DAO has no guild tokens configured"), letting a member burn
    // their shares for zero payout during an indexer outage. The failure was
    // reachable because getMember/getDao DO fall back on-chain, so balances rendered
    // fine while the treasury read empty.
    //
    // If this read also fails we THROW rather than returning [] — the caller must be
    // able to tell "no tokens" from "could not load".
    const addresses = await this.getOnChainGuildTokens(daoId)
    const now = new Date().toISOString()
    return addresses.map((address) => ({
      id: `${daoId}-${address}`,
      dao_id: daoId,
      token_address: address,
      enabled: true,
      created_at: now,
      tx_hash: '',
    }))
  }

  /**
   * Fetch the guild token address list directly from the on-chain contract.
   * Used to cross-reference the indexer data before submitting ragequit transactions.
   */
  async getOnChainGuildTokens(daoId: string): Promise<string[]> {
    const daoShip = getDAOShipContract(daoId)
    const tokens: string[] = await daoShip.getGuildTokens()
    return tokens.map((t: string) => t.toLowerCase())
  }

  // ── Proposal reads ─────────────────────────────────────────────────────

  /**
   * List proposals for a DAO, optionally filtered by status.
   */
  async getProposals(daoId: string, filters?: ProposalFilters): Promise<Proposal[]> {
    if (await isIndexerAvailable()) {
      try {
        return await proposalIndexerService.listProposals(daoId, filters)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through to on-chain
      }
    }

    return this.getProposalsFromChain(daoId)
  }

  /**
   * Get a single proposal by its composite ID (`${daoId}-${proposalNum}`).
   */
  async getProposal(compositeId: string): Promise<Proposal | null> {
    if (await isIndexerAvailable()) {
      try {
        const proposal = await proposalIndexerService.getProposal(compositeId)
        if (proposal) {
          if (!proposal.proposal_data) {
            console.warn('[DaoService] getProposal: indexer returned proposal without proposal_data', {
              id: compositeId,
              hasHash: !!proposal.proposal_data_hash,
              keys: Object.keys(proposal),
            })
          }
          return proposal
        }
      } catch (err) {
        logIndexerFallback(err)
        // Fall through to on-chain
      }
    }

    console.warn('[DaoService] getProposal: falling back to on-chain (proposal_data will be null)', compositeId)
    return this.getProposalFromChain(compositeId)
  }

  /**
   * Get active (non-cancelled, non-processed) proposals for a DAO.
   */
  async getActiveProposals(daoId: string): Promise<Proposal[]> {
    if (await isIndexerAvailable()) {
      try {
        return await proposalIndexerService.getActiveProposals(daoId)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through
      }
    }

    // On-chain fallback — fetch all and filter client-side
    const all = await this.getProposalsFromChain(daoId)
    return all.filter((p) => !p.cancelled && !p.processed)
  }

  // ── Member reads ───────────────────────────────────────────────────────

  /**
   * List all members for a DAO.
   */
  async getMembers(daoId: string): Promise<Member[]> {
    if (await isIndexerAvailable()) {
      try {
        const members = await memberIndexerService.listMembers(daoId)
        if (members.length > 0) return members
      } catch (err) {
        logIndexerFallback(err)
        // Fall through
      }
    }

    // No on-chain enumeration — member list requires indexer
    return []
  }

  /**
   * Get a single member by DAO ID and member address.
   */
  async getMember(daoId: string, memberAddress: string): Promise<Member | null> {
    if (await isIndexerAvailable()) {
      try {
        return await memberIndexerService.getMember(daoId, memberAddress)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through to on-chain
      }
    }

    return this.getMemberFromChain(daoId, memberAddress)
  }

  // ── Vote reads ─────────────────────────────────────────────────────────

  /**
   * Get all votes for a specific proposal.
   * @param proposalCompositeId  The composite proposal ID (`${daoId}-${num}`)
   */
  async getVotes(proposalCompositeId: string): Promise<Vote[]> {
    if (await isIndexerAvailable()) {
      try {
        return await voteIndexerService.getProposalVotes(proposalCompositeId)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through
      }
    }

    // No on-chain enumeration for votes
    return []
  }

  /**
   * Check if a member has voted on a specific proposal.
   */
  async hasVoted(daoId: string, proposalId: number, memberAddress: string): Promise<boolean> {
    if (await isIndexerAvailable()) {
      try {
        const votes = await voteIndexerService.getProposalVotes(`${daoId}-${proposalId}`)
        const normalizedAddress = memberAddress.toLowerCase()
        return votes.some((v) => v.voter.toLowerCase() === normalizedAddress)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through to on-chain
      }
    }

    // On-chain check via DAOShip.memberVoted(address, uint32)
    const daoShip = getDAOShipContract(daoId)
    return daoShip.memberVoted(memberAddress, proposalId) as Promise<boolean>
  }

  // ── Navigator reads ─────────────────────────────────────────────────────

  /**
   * List all navigators for a DAO.
   */
  async getNavigators(daoId: string): Promise<Navigator[]> {
    if (!(await isIndexerAvailable())) return []
    // No on-chain enumeration exists, so a silent [] here is indistinguishable from
    // "this DAO has no navigators". NavigatorSanctionForm posts the DAO's COMPLETE
    // endorsement set with last-write-wins semantics and seeds itself from this list,
    // so an empty-on-failure result would wipe every existing endorsement while the
    // form promised "Your DAO's other endorsements are preserved."
    return navigatorIndexerService.listNavigators(daoId)
  }

  /**
   * Get the permission level for a specific navigator address.
   */
  async getNavigatorPermission(daoId: string, navigatorAddress: string): Promise<number> {
    if (await isIndexerAvailable()) {
      try {
        const navigators = await navigatorIndexerService.listNavigators(daoId)
        const navigator = navigators.find(
          (s) => s.navigator_address.toLowerCase() === navigatorAddress.toLowerCase()
        )
        if (navigator) return navigator.permission
      } catch (err) {
        logIndexerFallback(err)
        // Fall through to on-chain
      }
    }

    const daoShip = getDAOShipContract(daoId)
    const perm = await daoShip.navigators(navigatorAddress)
    return Number(perm)
  }

  /**
   * Get navigator events (onboard, checkin, slash) for a DAO.
   */
  async getNavigatorEvents(daoId: string): Promise<NavigatorEvent[]> {
    if (await isIndexerAvailable()) {
      try {
        return await navigatorIndexerService.listNavigatorEvents(daoId)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through
      }
    }
    return []
  }

  // ── Record reads ───────────────────────────────────────────────────────

  /**
   * Get Poster records (metadata) for a DAO.
   */
  async getRecords(daoId: string): Promise<DaoRecord[]> {
    if (await isIndexerAvailable()) {
      try {
        return await recordIndexerService.getRecords(daoId)
      } catch (err) {
        logIndexerFallback(err)
        // Fall through
      }
    }
    return []
  }

  // ── Token reads ────────────────────────────────────────────────────────

  /**
   * Get the shares balance for a member.
   */
  async getSharesBalance(sharesAddress: string, memberAddress: string): Promise<bigint> {
    const shares = getSharesContract(sharesAddress)
    return shares.balanceOf(memberAddress) as Promise<bigint>
  }

  /**
   * Get the loot balance for a member.
   */
  async getLootBalance(lootAddress: string, memberAddress: string): Promise<bigint> {
    const loot = getLootContract(lootAddress)
    return loot.balanceOf(memberAddress) as Promise<bigint>
  }

  /**
   * Get the current delegation-aware voting power for a member.
   */
  async getCurrentVotes(daoId: string, memberAddress: string): Promise<bigint> {
    const daoShip = getDAOShipContract(daoId)
    return daoShip.getCurrentVotes(memberAddress) as Promise<bigint>
  }

  /**
   * Read sponsorship parameters directly from the contract.
   * Returns the on-chain sponsorThreshold and proposalOffering.
   */
  async getSponsorParams(daoId: string): Promise<{ sponsorThreshold: bigint; proposalOffering: bigint }> {
    const daoShip = getDAOShipContract(daoId)
    const [sponsorThreshold, proposalOffering] = await Promise.all([
      daoShip.sponsorThreshold() as Promise<bigint>,
      daoShip.proposalOffering() as Promise<bigint>,
    ])
    return { sponsorThreshold, proposalOffering }
  }

  /**
   * Read the defaultExpiryWindow directly from the DAOShip contract.
   *
   * Defense-in-depth fallback: the indexer now captures `defaultExpiryWindow`
   * from both `SetupComplete` and `GovernanceConfigSet` events. This on-chain
   * read covers DAOs launched before the indexer fix and brief post-launch lag.
   */
  async getDefaultExpiryWindow(daoId: string): Promise<number> {
    const daoShip = getDAOShipContract(daoId)
    const value = await daoShip.defaultExpiryWindow() as bigint
    return Number(value)
  }

  /**
   * Get historical voting power at a specific timepoint.
   */
  async getPriorVotes(daoId: string, memberAddress: string, timepoint: bigint): Promise<bigint> {
    const daoShip = getDAOShipContract(daoId)
    return daoShip.getPriorVotes(memberAddress, timepoint) as Promise<bigint>
  }

  /**
   * Get the total shares supply.
   */
  async getTotalShares(daoId: string): Promise<bigint> {
    const daoShip = getDAOShipContract(daoId)
    return daoShip.totalShares() as Promise<bigint>
  }

  /**
   * Get the total loot supply.
   */
  async getTotalLoot(daoId: string): Promise<bigint> {
    const daoShip = getDAOShipContract(daoId)
    return daoShip.totalLoot() as Promise<bigint>
  }

  // ── Onboarder navigator reads ──────────────────────────────────────────

  /**
   * Get the onboarder navigator configuration.
   */
  async getOnboarderConfig(navigatorAddress: string): Promise<{
    pricePerUnit: bigint
    sharePerUnit: bigint
    lootPerUnit: bigint
    expiry: bigint
  }> {
    const navigator = getERC20TributeNavigatorContract(navigatorAddress)
    const [pricePerUnit, sharePerUnit, lootPerUnit, expiry] = await Promise.all([
      navigator.pricePerUnit() as Promise<bigint>,
      navigator.sharePerUnit() as Promise<bigint>,
      navigator.lootPerUnit() as Promise<bigint>,
      navigator.expiry() as Promise<bigint>,
    ])
    return { pricePerUnit, sharePerUnit, lootPerUnit, expiry }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // WRITE METHODS - Always on-chain
  // ═════════════════════════════════════════════════════════════════════════


  // ── Proposal / ragequit / delegation / onboard / poster writes ─────────

  submitProposal(daoId: string, proposalData: string, expiration: number, details: string): Promise<bigint> {
    return daoWriteService.submitProposal(daoId, proposalData, expiration, details)
  }

  sponsorProposal(daoId: string, proposalId: number): Promise<void> {
    return daoWriteService.sponsorProposal(daoId, proposalId)
  }

  submitVote(daoId: string, proposalId: number, approved: boolean): Promise<void> {
    return daoWriteService.submitVote(daoId, proposalId, approved)
  }

  processProposal(daoId: string, proposalId: number, proposalData: string): Promise<void> {
    return daoWriteService.processProposal(daoId, proposalId, proposalData)
  }

  cancelProposal(daoId: string, proposalId: number): Promise<void> {
    return daoWriteService.cancelProposal(daoId, proposalId)
  }

  ragequit(daoId: string, to: string, sharesToBurn: bigint, lootToBurn: bigint, tokens: string[]): Promise<void> {
    return daoWriteService.ragequit(daoId, to, sharesToBurn, lootToBurn, tokens)
  }

  delegate(sharesAddress: string, delegatee: string): Promise<void> {
    return daoWriteService.delegate(sharesAddress, delegatee)
  }

  onboardEth(navigatorAddress: string, value: bigint): Promise<void> {
    return daoWriteService.onboardEth(navigatorAddress, value)
  }

  onboard(navigatorAddress: string, value: bigint): Promise<void> {
    return daoWriteService.onboard(navigatorAddress, value)
  }

  post(content: string, tag: string): Promise<void> {
    return daoWriteService.post(content, tag)
  }

  // ── Launch ─────────────────────────────────────────────────────────────

  launchDAOShipAndVault(
    initializationParamsTemplate: string,
    shareTokenName: string,
    shareTokenSymbol: string,
    lootTokenName: string,
    lootTokenSymbol: string,
    vaultOwners: string[],
    vaultThreshold: bigint,
    vaultSalt: bigint,
    sharesSalt: bigint,
    lootSalt: bigint,
    daoShipSalt: bigint,
  ): Promise<{ daoShip: string; vault: string }> {
    return launchService.launchDAOShipAndVault(
      initializationParamsTemplate, shareTokenName, shareTokenSymbol, lootTokenName, lootTokenSymbol,
      vaultOwners, vaultThreshold, vaultSalt, sharesSalt, lootSalt, daoShipSalt,
    )
  }
  // ═════════════════════════════════════════════════════════════════════════
  // Sub-service accessors for direct access
  // ═════════════════════════════════════════════════════════════════════════

  /** Access the IndexerHealthService directly. */
  get health() {
    return indexerHealthService
  }

  /** Access the DaoIndexerService directly. */
  get daoIndexer() {
    return daoIndexerService
  }

  /** Access the ProposalIndexerService directly. */
  get proposalIndexer() {
    return proposalIndexerService
  }

  /** Access the BaseService (provider/signer management). */
  get base() {
    return baseService
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE: On-chain fallback helpers
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Read a single DAO's core state from the DAOShip contract on-chain.
   * Returns a partial Dao object with fields that are available on-chain.
   */
  private async getDaoFromChain(daoId: string): Promise<Dao | null> {
    try {
      const daoShip = getDAOShipContract(daoId)

      const [
        sharesTokenAddr,
        lootTokenAddr,
        avatarAddr,
        votingPeriod,
        gracePeriod,
        proposalOffering,
        quorumPercent,
        sponsorThreshold,
        minRetentionPercent,
        proposalCount,
        totalShares,
        totalLoot,
        latestSponsoredProposalId,
        adminLocked,
        managerLocked,
        governorLocked,
      ] = await Promise.all([
        daoShip.sharesToken() as Promise<string>,
        daoShip.lootToken() as Promise<string>,
        daoShip.avatar() as Promise<string>,
        daoShip.votingPeriod() as Promise<bigint>,
        daoShip.gracePeriod() as Promise<bigint>,
        daoShip.proposalOffering() as Promise<bigint>,
        daoShip.quorumPercent() as Promise<bigint>,
        daoShip.sponsorThreshold() as Promise<bigint>,
        daoShip.minRetentionPercent() as Promise<bigint>,
        daoShip.proposalCount() as Promise<bigint>,
        daoShip.totalShares() as Promise<bigint>,
        daoShip.totalLoot() as Promise<bigint>,
        daoShip.latestSponsoredProposalId() as Promise<bigint>,
        daoShip.adminLock() as Promise<boolean>,
        daoShip.managerLock() as Promise<boolean>,
        daoShip.governorLock() as Promise<boolean>,
      ])

      // Build a Dao object with on-chain data; metadata fields are null
      const now = new Date().toISOString()
      return {
        id: daoId,
        created_at: now,
        tx_hash: '',
        loot_address: lootTokenAddr,
        shares_address: sharesTokenAddr,
        avatar: avatarAddr,
        // On-chain fallback cannot recover deployer/launcher_contract — those live in event logs.
        // Callers that need these fields should use the indexer path.
        deployer: '',
        launcher_contract: '',
        new_vault: false,
        loot_paused: false,
        shares_paused: false,
        grace_period: Number(gracePeriod),
        voting_period: Number(votingPeriod),
        voting_plus_grace_duration: Number(votingPeriod) + Number(gracePeriod),
        proposal_offering: proposalOffering.toString(),
        quorum_percent: quorumPercent.toString(),
        sponsor_threshold: sponsorThreshold.toString(),
        min_retention_percent: minRetentionPercent.toString(),
        default_expiry_window: 0,
        total_shares: totalShares.toString(),
        total_loot: totalLoot.toString(),
        latest_sponsored_proposal_id: Number(latestSponsoredProposalId),
        proposal_count: Number(proposalCount),
        active_member_count: 0,
        admin_locked: adminLocked,
        manager_locked: managerLocked,
        governor_locked: governorLocked,
        profile_source: null,
        updated_at: now,
      }
    } catch (error) {
      console.error('[DaoService] getDaoFromChain error:', error)
      // With no wallet provider we can't read chain at all — that's "couldn't load", NOT
      // "this DAO doesn't exist". Throw so React Query treats it as a transient error and
      // keeps any previously-loaded DAO, instead of rendering a false "DAO Not Found".
      if (!baseService.hasProvider()) {
        throw new Error('Unable to load DAO: the indexer is unreachable and no wallet is connected.')
      }
      return null
    }
  }

  /**
   * Read proposals from on-chain. Iterates from proposalCount down to 1.
   * Note: This is significantly slower than the indexer since each proposal
   * requires a separate RPC call.
   */
  private async getProposalsFromChain(daoId: string): Promise<Proposal[]> {
    try {
      const daoShip = getDAOShipContract(daoId)
      const proposalCount = Number(await daoShip.proposalCount())

      if (proposalCount === 0) return []

      // Walk the whole range in batches. Previously `start`/`end` were computed once
      // and the single newest-20 batch WAS the complete result, so on a 60-proposal
      // DAO during an indexer outage proposal #7 simply vanished with no indication.
      const batchSize = 20
      const proposals: Proposal[] = []

      for (let hi = proposalCount; hi >= 1; hi -= batchSize) {
        const lo = Math.max(1, hi - batchSize + 1)
        const promises = []
        for (let i = hi; i >= lo; i--) {
          promises.push(this.getProposalFromChainById(daoShip, daoId, i))
        }

        const results = await Promise.allSettled(promises)
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            proposals.push(result.value)
          }
        }
      }

      return proposals
    } catch (error) {
      console.error('[DaoService] getProposalsFromChain error:', error)
      return []
    }
  }

  /**
   * Get a single proposal from chain by its composite ID.
   */
  private async getProposalFromChain(compositeId: string): Promise<Proposal | null> {
    // Parse composite ID: `${daoId}-${proposalNum}` where daoId is 42-char hex address
    const lastDash = compositeId.lastIndexOf('-')
    if (lastDash === -1) return null

    const daoId = compositeId.slice(0, lastDash)
    const proposalNum = parseInt(compositeId.slice(lastDash + 1), 10)
    if (isNaN(proposalNum)) return null

    try {
      const daoShip = getDAOShipContract(daoId)
      return await this.getProposalFromChainById(daoShip, daoId, proposalNum)
    } catch {
      return null
    }
  }

  /**
   * Fetch a single on-chain proposal struct and map it to our Proposal type.
   */
  private async getProposalFromChainById(
    daoShip: quais.Contract,
    daoId: string,
    proposalId: number
  ): Promise<Proposal | null> {
    try {
      const p = await daoShip.proposals(proposalId)

      // Get proposal status flags: [cancelled, processed, passed, actionFailed]
      const status: boolean[] = await daoShip.getProposalStatus(proposalId)

      const now = new Date().toISOString()
      const votingStarts = Number(p.votingStarts)
      const votingEnds = Number(p.votingEnds)
      const graceEnds = Number(p.graceEnds)
      const expiration = Number(p.expiration)

      return {
        id: `${daoId}-${proposalId}`,
        dao_id: daoId,
        proposal_id: Number(proposalId),
        created_at: votingStarts > 0
          ? new Date(votingStarts * 1000).toISOString()
          : now,
        submitter: p.submitter,
        tx_hash: '',
        proposal_data_hash: p.proposalDataHash,
        proposal_data: null,
        details: p.details || null,
        prev_proposal_id: Number(p.prevProposalId) > 0 ? Number(p.prevProposalId) : null,
        sponsored: votingStarts > 0,
        sponsor: p.sponsor !== '0x0000000000000000000000000000000000000000' ? p.sponsor : null,
        sponsor_tx_hash: null,
        sponsor_tx_at: votingStarts > 0 ? new Date(votingStarts * 1000).toISOString() : null,
        self_sponsored: p.submitter.toLowerCase() === p.sponsor?.toLowerCase(),
        voting_period: votingEnds - votingStarts,
        voting_starts: votingStarts > 0 ? new Date(votingStarts * 1000).toISOString() : null,
        voting_ends: votingEnds > 0 ? new Date(votingEnds * 1000).toISOString() : null,
        grace_ends: graceEnds > 0 ? new Date(graceEnds * 1000).toISOString() : null,
        expiration: expiration > 0 ? new Date(expiration * 1000).toISOString() : null,
        cancelled: status[0] ?? false,
        cancelled_tx_hash: null,
        cancelled_tx_at: null,
        cancelled_by: null,
        processed: status[1] ?? false,
        process_tx_hash: null,
        process_tx_at: null,
        processed_by: null,
        action_failed: status[3] ?? false,
        passed: status[2] ?? false,
        yes_votes: Number(p.yesVotes),
        no_votes: Number(p.noVotes),
        yes_balance: p.yesBalance.toString(),
        no_balance: p.noBalance.toString(),
        // These are DISTINCT fields. Writing the sponsor snapshot into the
        // at-vote high-water mark left max_total_shares_at_sponsor undefined, and
        // willProposalPass reads `BigInt(max_total_shares_at_sponsor || '0')` — so
        // the quorum threshold silently collapsed to zero.
        max_total_shares_at_sponsor: p.maxTotalSharesAtSponsor?.toString() ?? '0',
        max_total_shares_and_loot_at_vote: p.maxTotalSharesAndLootAtVote?.toString() ?? '0',
        proposal_offering: '0',
        block_number: 0,
      }
    } catch {
      return null
    }
  }

  /**
   * Get a member from chain by reading token balances and delegate.
   */
  private async getMemberFromChain(daoId: string, memberAddress: string): Promise<Member | null> {
    try {
      const daoShip = getDAOShipContract(daoId)
      const [sharesAddr, lootAddr] = await Promise.all([
        daoShip.sharesToken() as Promise<string>,
        daoShip.lootToken() as Promise<string>,
      ])

      const sharesContract = getSharesContract(sharesAddr)
      const lootContract = getLootContract(lootAddr)

      const [shares, loot, _currentVotes] = await Promise.all([
        sharesContract.balanceOf(memberAddress) as Promise<bigint>,
        lootContract.balanceOf(memberAddress) as Promise<bigint>,
        daoShip.getCurrentVotes(memberAddress) as Promise<bigint>,
      ])

      // If no shares and no loot, not a member
      if (shares === 0n && loot === 0n) return null

      const now = new Date().toISOString()
      return {
        id: `${daoId}-${memberAddress.toLowerCase()}`,
        dao_id: daoId,
        member_address: memberAddress.toLowerCase(),
        created_at: now,
        shares: shares.toString(),
        loot: loot.toString(),
        delegating_to: null,
        // Was hardcoded '0' despite _currentVotes being fetched above, so during an
        // indexer outage a member holding 100% of shares could not sponsor.
        voting_power: _currentVotes.toString(),
        votes: 0,
        last_activity_at: null,
        updated_at: now,
      }
    } catch {
      return null
    }
  }

}

// ── Singleton export ─────────────────────────────────────────────────────

export const daoService = new DaoService()

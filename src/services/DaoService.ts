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

import { baseService } from '@/services/core/BaseService'
import { indexerHealthService } from '@/services/indexer/IndexerHealthService'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { proposalIndexerService } from '@/services/indexer/ProposalIndexerService'
import type { ProposalFilters } from '@/services/indexer/ProposalIndexerService'

import { invalidateIndexerCache as resetIndexerCache } from './dao/indexerGate'
import { daoWriteService } from './dao/DaoWriteService'
import { launchService } from './dao/LaunchService'
import { daoReadService } from './dao/DaoReadService'


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


  getDao(daoId: string) { return daoReadService.getDao(daoId) }
  getDaos() { return daoReadService.getDaos() }
  getDaosByMember(address: string) { return daoReadService.getDaosByMember(address) }
  getGuildTokens(daoId: string) { return daoReadService.getGuildTokens(daoId) }
  getOnChainGuildTokens(daoId: string) { return daoReadService.getOnChainGuildTokens(daoId) }
  getProposals(daoId: string, filters?: ProposalFilters) { return daoReadService.getProposals(daoId, filters) }
  getProposal(compositeId: string) { return daoReadService.getProposal(compositeId) }
  getActiveProposals(daoId: string) { return daoReadService.getActiveProposals(daoId) }
  getMembers(daoId: string) { return daoReadService.getMembers(daoId) }
  getMember(daoId: string, memberAddress: string) { return daoReadService.getMember(daoId, memberAddress) }
  getVotes(proposalCompositeId: string) { return daoReadService.getVotes(proposalCompositeId) }
  hasVoted(daoId: string, proposalId: number, memberAddress: string) { return daoReadService.hasVoted(daoId, proposalId, memberAddress) }
  getNavigators(daoId: string) { return daoReadService.getNavigators(daoId) }
  getNavigatorPermission(daoId: string, navigatorAddress: string) { return daoReadService.getNavigatorPermission(daoId, navigatorAddress) }
  getNavigatorEvents(daoId: string) { return daoReadService.getNavigatorEvents(daoId) }
  getRecords(daoId: string) { return daoReadService.getRecords(daoId) }
  getSharesBalance(sharesAddress: string, memberAddress: string) { return daoReadService.getSharesBalance(sharesAddress, memberAddress) }
  getLootBalance(lootAddress: string, memberAddress: string) { return daoReadService.getLootBalance(lootAddress, memberAddress) }
  getCurrentVotes(daoId: string, memberAddress: string) { return daoReadService.getCurrentVotes(daoId, memberAddress) }
  getSponsorParams(daoId: string) { return daoReadService.getSponsorParams(daoId) }
  getDefaultExpiryWindow(daoId: string) { return daoReadService.getDefaultExpiryWindow(daoId) }
  getPriorVotes(daoId: string, memberAddress: string, timepoint: bigint) { return daoReadService.getPriorVotes(daoId, memberAddress, timepoint) }
  getTotalShares(daoId: string) { return daoReadService.getTotalShares(daoId) }
  getTotalLoot(daoId: string) { return daoReadService.getTotalLoot(daoId) }
  getOnboarderConfig(navigatorAddress: string) { return daoReadService.getOnboarderConfig(navigatorAddress) }


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

}

// ── Singleton export ─────────────────────────────────────────────────────

export const daoService = new DaoService()

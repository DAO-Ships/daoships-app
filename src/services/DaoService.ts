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
//   await daoService.submitProposal(daoId, proposalData, expiration, details)
//
//   // Direct sub-service access when needed
//   const config = daoService.daoShip.getGovernanceConfig(daoId)
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { INDEXER_CONFIG } from '@/config/supabase'
import { CONTRACT_ADDRESSES } from '@/config/contracts'
import { baseService } from '@/services/core/BaseService'
import { indexerHealthService } from '@/services/indexer/IndexerHealthService'
import { daoIndexerService } from '@/services/indexer/DaoIndexerService'
import { proposalIndexerService } from '@/services/indexer/ProposalIndexerService'
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

import { estimateGasOrThrow } from '@/services/utils/GasEstimator'
import DAOShipAbi from '@/config/abi/DAOShip.json'
import DAOShipAndVaultLauncherAbi from '@/config/abi/DAOShipAndVaultLauncher.json'
import SharesERC20Abi from '@/config/abi/SharesERC20.json'
import LootERC20Abi from '@/config/abi/LootERC20.json'
import PosterAbi from '@/config/abi/Poster.json'
import ERC20TributeNavigatorAbi from '@/config/abi/ERC20TributeNavigator.json'
import OnboarderNavigatorAbi from '@/config/abi/OnboarderNavigator.json'

// ── Supabase table helpers ───────────────────────────────────────────────

import { supabase } from '@/config/supabase'

// ── Indexer availability cache ───────────────────────────────────────────

let indexerAvailableCache: boolean | null = null
let indexerCheckTimestamp = 0
let indexerCheckPromise: Promise<boolean> | null = null

async function isIndexerAvailable(): Promise<boolean> {
  if (!INDEXER_CONFIG.ENABLED) return false

  const now = Date.now()
  if (indexerAvailableCache !== null && now - indexerCheckTimestamp < INDEXER_CONFIG.HEALTH_CACHE_MS) {
    return indexerAvailableCache
  }

  // Deduplicate concurrent calls
  if (indexerCheckPromise) return indexerCheckPromise

  indexerCheckPromise = (async () => {
    try {
      indexerAvailableCache = await indexerHealthService.isHealthy()
      indexerCheckTimestamp = Date.now()
      return indexerAvailableCache
    } catch {
      indexerAvailableCache = false
      indexerCheckTimestamp = Date.now()
      return false
    } finally {
      indexerCheckPromise = null
    }
  })()

  return indexerCheckPromise
}

// ═══════════════════════════════════════════════════════════════════════════
// Contract instance helpers (lazy, use provider for reads / signer for writes)
// ═══════════════════════════════════════════════════════════════════════════

function getDAOShipContract(daoId: string): quais.Contract {
  return new quais.Contract(quais.getAddress(daoId), DAOShipAbi, baseService.getProvider())
}

function getDAOShipContractWithSigner(daoId: string): quais.Contract {
  return new quais.Contract(quais.getAddress(daoId), DAOShipAbi, baseService.requireSigner())
}

function getLauncherContract(): quais.Contract {
  return new quais.Contract(
    CONTRACT_ADDRESSES.DAOSHIP_AND_VAULT_LAUNCHER,
    DAOShipAndVaultLauncherAbi,
    baseService.requireSigner()
  )
}

function getSharesContract(sharesAddress: string): quais.Contract {
  return new quais.Contract(sharesAddress, SharesERC20Abi, baseService.getProvider())
}

function getSharesContractWithSigner(sharesAddress: string): quais.Contract {
  return new quais.Contract(sharesAddress, SharesERC20Abi, baseService.requireSigner())
}

function getLootContract(lootAddress: string): quais.Contract {
  return new quais.Contract(lootAddress, LootERC20Abi, baseService.getProvider())
}

function getPosterContractWithSigner(): quais.Contract {
  return new quais.Contract(CONTRACT_ADDRESSES.POSTER, PosterAbi, baseService.requireSigner())
}

function getERC20TributeNavigatorContract(navigatorAddress: string): quais.Contract {
  return new quais.Contract(navigatorAddress, ERC20TributeNavigatorAbi, baseService.getProvider())
}

function getERC20TributeNavigatorContractWithSigner(navigatorAddress: string): quais.Contract {
  return new quais.Contract(navigatorAddress, ERC20TributeNavigatorAbi, baseService.requireSigner())
}

function getOnboarderNavigatorContractWithSigner(navigatorAddress: string): quais.Contract {
  return new quais.Contract(navigatorAddress, OnboarderNavigatorAbi, baseService.requireSigner())
}

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
    indexerAvailableCache = null
    indexerCheckTimestamp = 0
  }

  // ═════════════════════════════════════════════════════════════════════════
  // READ METHODS - Indexer first, RPC fallback
  // ═════════════════════════════════════════════════════════════════════════

  // ── DAO reads ──────────────────────────────────────────────────────────

  /**
   * Get a single DAO by its DAOShip contract address.
   */
  async getDao(daoId: string): Promise<Dao | null> {
    if (await isIndexerAvailable()) {
      try {
        const dao = await daoIndexerService.getDao(daoId)
        if (dao) return dao
      } catch {
        // Silently fall back to on-chain
      }
    }

    return this.getDaoFromChain(daoId)
  }

  /**
   * List all DAOs, newest first.
   */
  async getDaos(): Promise<Dao[]> {
    if (await isIndexerAvailable()) {
      try {
        const daos = await daoIndexerService.listDaos()
        if (daos.length > 0) return daos
      } catch {
        // Fall back to empty — no on-chain equivalent for listing all DAOs
      }
    }

    // No on-chain equivalent for "all DAOs" — return empty
    return []
  }

  /**
   * Get all DAOs that a given address is a member of.
   */
  async getDaosByMember(address: string): Promise<Dao[]> {
    if (await isIndexerAvailable()) {
      try {
        return await daoIndexerService.getDaosByMember(address)
      } catch {
        // No on-chain equivalent
      }
    }
    return []
  }

  /**
   * Get guild tokens (ragequit-eligible tokens) for a DAO.
   */
  async getGuildTokens(daoId: string): Promise<GuildToken[]> {
    if (await isIndexerAvailable()) {
      try {
        return await daoIndexerService.getGuildTokens(daoId)
      } catch {
        // Fall through to empty
      }
    }
    // No on-chain list enumeration available
    return []
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
      } catch {
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
      } catch {
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
      } catch {
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
        const members = await this.getMembersFromIndexer(daoId)
        if (members.length > 0) return members
      } catch {
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
        return await this.getMemberFromIndexer(daoId, memberAddress)
      } catch {
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
        return await this.getVotesFromIndexer(proposalCompositeId)
      } catch {
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
        const votes = await this.getVotesFromIndexer(`${daoId}-${proposalId}`)
        const normalizedAddress = memberAddress.toLowerCase()
        return votes.some((v) => v.voter.toLowerCase() === normalizedAddress)
      } catch {
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
    if (await isIndexerAvailable()) {
      try {
        return await this.getNavigatorsFromIndexer(daoId)
      } catch {
        // Fall through
      }
    }
    // No on-chain enumeration
    return []
  }

  /**
   * Get the permission level for a specific navigator address.
   */
  async getNavigatorPermission(daoId: string, navigatorAddress: string): Promise<number> {
    if (await isIndexerAvailable()) {
      try {
        const navigators = await this.getNavigatorsFromIndexer(daoId)
        const navigator = navigators.find(
          (s) => s.navigator_address.toLowerCase() === navigatorAddress.toLowerCase()
        )
        if (navigator) return navigator.permission
      } catch {
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
        return await this.getNavigatorEventsFromIndexer(daoId)
      } catch {
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
        return await this.getRecordsFromIndexer(daoId)
      } catch {
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

  // ── Proposal writes ────────────────────────────────────────────────────

  /**
   * Submit a new proposal to the DAO.
   *
   * @param daoId         DAOShip contract address
   * @param proposalData  ABI-encoded action data (MultiSend-packed bytes)
   * @param expiration    Expiration timestamp (0 = no expiration)
   * @param details       Human-readable details / IPFS hash
   * @param offering      Proposal offering value in wei (sent as msg.value)
   * @returns The proposal ID
   */
  async submitProposal(
    daoId: string,
    proposalData: string,
    expiration: number,
    details: string,
    offering: bigint = 0n,
  ): Promise<bigint> {
    const daoShip = getDAOShipContractWithSigner(daoId)

    // The contract's submitProposal uses sharesToken.getPriorVotes(sender, block.timestamp - 1)
    // to decide self-sponsorship. daoShip.getCurrentVotes() now correctly proxies to
    // sharesToken.getCurrentVotes() which is delegation-aware.
    const signer = baseService.requireSigner()
    const signerAddress = await signer.getAddress()
    const [votingPower, sponsorThreshold, contractOffering] = await Promise.all([
      daoShip.getCurrentVotes(signerAddress) as Promise<bigint>,
      daoShip.sponsorThreshold() as Promise<bigint>,
      daoShip.proposalOffering() as Promise<bigint>,
    ])
    const canSelfSponsor = votingPower >= sponsorThreshold
    const effectiveOffering = canSelfSponsor ? 0n : contractOffering

    const overrides = effectiveOffering > 0n ? { value: effectiveOffering } : undefined
    await estimateGasOrThrow(
      daoShip, 'submitProposal',
      [proposalData, expiration, details],
      'Submit Proposal',
      overrides,
    )
    const tx = await daoShip.submitProposal(proposalData, expiration, details, {
      value: effectiveOffering,
    })
    const receipt = await tx.wait()

    // Parse the SubmitProposal event to extract the proposal ID
    const iface = new quais.Interface(DAOShipAbi)
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data })
        if (parsed?.name === 'SubmitProposal') {
          return parsed.args.proposal as bigint
        }
      } catch {
        // Not this event, continue
      }
    }

    throw new Error('SubmitProposal event not found in transaction receipt')
  }

  /**
   * Sponsor a submitted proposal to begin voting.
   *
   * @param daoId       DAOShip contract address
   * @param proposalId  The proposal number to sponsor
   */
  async sponsorProposal(daoId: string, proposalId: number): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    await estimateGasOrThrow(daoShip, 'sponsorProposal', [proposalId], 'Sponsor Proposal')
    const tx = await daoShip.sponsorProposal(proposalId)
    await tx.wait()
  }

  /**
   * Submit a vote on an active proposal.
   *
   * @param daoId       DAOShip contract address
   * @param proposalId  The proposal number to vote on
   * @param approved    true = yes vote, false = no vote
   */
  async submitVote(daoId: string, proposalId: number, approved: boolean): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    await estimateGasOrThrow(daoShip, 'submitVote', [proposalId, approved], 'Vote on Proposal')
    const tx = await daoShip.submitVote(proposalId, approved)
    await tx.wait()
  }

  /**
   * Process a proposal that has passed voting and grace period.
   *
   * @param daoId        DAOShip contract address
   * @param proposalId   The proposal number to process
   * @param proposalData The same proposalData bytes that were submitted
   */
  async processProposal(daoId: string, proposalId: number, proposalData: string): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    await estimateGasOrThrow(daoShip, 'processProposal', [proposalId, proposalData], 'Process Proposal')
    const tx = await daoShip.processProposal(proposalId, proposalData)
    await tx.wait()
  }

  /**
   * Cancel a proposal (only the submitter can cancel, or anyone if expired).
   *
   * @param daoId       DAOShip contract address
   * @param proposalId  The proposal number to cancel
   */
  async cancelProposal(daoId: string, proposalId: number): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    await estimateGasOrThrow(daoShip, 'cancelProposal', [proposalId], 'Cancel Proposal')
    const tx = await daoShip.cancelProposal(proposalId)
    await tx.wait()
  }

  // ── Ragequit ───────────────────────────────────────────────────────────

  /**
   * Ragequit — burn shares/loot to withdraw proportional tokens from the treasury.
   *
   * @param daoId        DAOShip contract address
   * @param to           Recipient of the withdrawn tokens
   * @param sharesToBurn Amount of shares to burn
   * @param lootToBurn   Amount of loot to burn
   * @param tokens       Array of guild token addresses to withdraw
   */
  async ragequit(
    daoId: string,
    to: string,
    sharesToBurn: bigint,
    lootToBurn: bigint,
    tokens: string[],
  ): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    await estimateGasOrThrow(daoShip, 'ragequit', [to, sharesToBurn, lootToBurn, tokens], 'Ragequit')
    const tx = await daoShip.ragequit(to, sharesToBurn, lootToBurn, tokens)
    await tx.wait()
  }

  // ── Launcher ───────────────────────────────────────────────────────────

  /**
   * Launch a new DAOShip with a new Quai Vault.
   *
   * @param initializationParams   ABI-encoded DAOShip setup parameters
   * @param initializationActions  Array of ABI-encoded initialization action calls
   * @param vaultOwners            Addresses that own the vault
   * @param vaultThreshold         Multisig threshold for the vault
   * @param vaultSalt              Salt for CREATE2 vault deployment
   * @param sharesSalt             Salt for CREATE2 shares token deployment
   * @param lootSalt               Salt for CREATE2 loot token deployment
   * @param daoShipSalt            Salt for CREATE2 DAOShip deployment
   * @returns Deployed DAOShip and vault addresses
   */
  async launchDAOShipAndVault(
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
    const launcher = getLauncherContract()
    const tx = await launcher.launchDAOShipAndVault(
      initializationParamsTemplate,
      shareTokenName,
      shareTokenSymbol,
      lootTokenName,
      lootTokenSymbol,
      vaultOwners,
      vaultThreshold,
      vaultSalt,
      sharesSalt,
      lootSalt,
      daoShipSalt,
    )
    const receipt = await tx.wait()

    // Parse the LaunchDAOShipAndVault event
    const iface = new quais.Interface(DAOShipAndVaultLauncherAbi)
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data })
        if (parsed?.name === 'LaunchDAOShipAndVault') {
          return {
            daoShip: parsed.args.daoShip as string,
            vault: parsed.args.vault as string,
          }
        }
      } catch {
        // Not this event, continue
      }
    }

    throw new Error('LaunchDAOShipAndVault event not found in transaction receipt')
  }

  // ── Delegate ───────────────────────────────────────────────────────────

  /**
   * Delegate shares voting power to another address.
   *
   * @param sharesAddress  The shares ERC-20 contract address
   * @param delegatee      The address to delegate to (use own address to self-delegate)
   */
  async delegate(sharesAddress: string, delegatee: string): Promise<void> {
    const shares = getSharesContractWithSigner(sharesAddress)
    const tx = await shares.delegate(delegatee)
    await tx.wait()
  }

  // ── Onboard (navigator) ────────────────────────────────────────────────

  /**
   * Onboard to a DAO via an ERC20TributeNavigator (pay native token to join).
   *
   * @param navigatorAddress  Address of the ERC20TributeNavigator contract
   * @param value             Amount of native token to send (in wei)
   */
  async onboardEth(navigatorAddress: string, value: bigint): Promise<void> {
    const navigator = getERC20TributeNavigatorContractWithSigner(navigatorAddress)
    const tx = await navigator.onboard({ value })
    await tx.wait()
  }

  /**
   * Onboard to a DAO via an OnboarderNavigator (fixed-price QUAI join).
   *
   * @param navigatorAddress  Address of the OnboarderNavigator contract
   * @param value             Amount of native token to send (in wei)
   */
  async onboard(navigatorAddress: string, value: bigint): Promise<void> {
    const navigator = getOnboarderNavigatorContractWithSigner(navigatorAddress)
    const tx = await navigator.onboard({ value })
    await tx.wait()
  }

  // ── Poster (metadata) ─────────────────────────────────────────────────

  /**
   * Post DAO metadata via the Poster.sol contract.
   *
   * @param content  JSON-encoded metadata content
   * @param tag      The tag to categorize this post (e.g. DAO address)
   */
  async post(content: string, tag: string): Promise<void> {
    const poster = getPosterContractWithSigner()
    const tx = await poster['post(string,string)'](content, tag)
    await tx.wait()
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
        launcher: '',
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

      // Fetch proposals in parallel (batch of up to 20 to avoid RPC overload)
      const batchSize = 20
      const proposals: Proposal[] = []
      const start = proposalCount
      const end = Math.max(1, proposalCount - batchSize + 1)

      const promises = []
      for (let i = start; i >= end; i--) {
        promises.push(this.getProposalFromChainById(daoShip, daoId, i))
      }

      const results = await Promise.allSettled(promises)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          proposals.push(result.value)
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
        proposal_id: proposalId.toString(),
        created_at: votingStarts > 0
          ? new Date(votingStarts * 1000).toISOString()
          : now,
        submitter: p.submitter,
        tx_hash: '',
        proposal_data_hash: p.proposalDataHash,
        proposal_data: null,
        details: p.details || null,
        prev_proposal_id: Number(p.prevProposalId) > 0 ? p.prevProposalId.toString() : null,
        sponsored: votingStarts > 0,
        sponsor: p.sponsor !== '0x0000000000000000000000000000000000000000' ? p.sponsor : null,
        sponsor_tx_hash: null,
        sponsor_tx_at: votingStarts > 0 ? new Date(votingStarts * 1000).toISOString() : null,
        self_sponsored: p.submitter.toLowerCase() === p.sponsor?.toLowerCase(),
        voting_period: (votingEnds - votingStarts).toString(),
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
        yes_votes: p.yesVotes.toString(),
        no_votes: p.noVotes.toString(),
        yes_balance: p.yesBalance.toString(),
        no_balance: p.noBalance.toString(),
        max_total_shares_and_loot_at_vote: p.maxTotalSharesAtSponsor?.toString() ?? null,
        proposal_offering: null,
        block_number: '0',
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
        voting_power: '0',
        votes: 0,
        last_activity_at: null,
        updated_at: now,
      }
    } catch {
      return null
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE: Indexer query helpers (direct Supabase)
  // ═════════════════════════════════════════════════════════════════════════

  private async getMembersFromIndexer(daoId: string): Promise<Member[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_members')
      .select('*')
      .eq('dao_id', daoId)
      .or('shares.gt.0,loot.gt.0')
      .order('shares', { ascending: false })

    if (error) {
      console.error('[DaoService] getMembersFromIndexer error:', error.message)
      return []
    }

    return (data as Member[]) ?? []
  }

  private async getMemberFromIndexer(daoId: string, memberAddress: string): Promise<Member | null> {
    if (!supabase) return null

    const compositeId = `${daoId.toLowerCase()}-${memberAddress.toLowerCase()}`
    const { data, error } = await supabase
      .from('ds_members')
      .select('*')
      .eq('id', compositeId)
      .single()

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('[DaoService] getMemberFromIndexer error:', error.message)
      }
      return null
    }

    return (data as Member) ?? null
  }

  private async getVotesFromIndexer(proposalCompositeId: string): Promise<Vote[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_votes')
      .select('*')
      .eq('proposal_id', proposalCompositeId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[DaoService] getVotesFromIndexer error:', error.message)
      return []
    }

    return (data as Vote[]) ?? []
  }

  private async getNavigatorsFromIndexer(daoId: string): Promise<Navigator[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_navigators')
      .select('*')
      .eq('dao_id', daoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DaoService] getNavigatorsFromIndexer error:', error.message)
      return []
    }

    return (data as Navigator[]) ?? []
  }

  private async getNavigatorEventsFromIndexer(daoId: string): Promise<NavigatorEvent[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_navigator_events')
      .select('*')
      .eq('dao_id', daoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DaoService] getNavigatorEventsFromIndexer error:', error.message)
      return []
    }

    return (data as NavigatorEvent[]) ?? []
  }

  private async getRecordsFromIndexer(daoId: string): Promise<DaoRecord[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('ds_records')
      .select('*')
      .eq('dao_id', daoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DaoService] getRecordsFromIndexer error:', error.message)
      return []
    }

    return (data as DaoRecord[]) ?? []
  }
}

// ── Singleton export ─────────────────────────────────────────────────────

export const daoService = new DaoService()

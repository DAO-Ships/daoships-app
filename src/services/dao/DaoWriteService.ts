// ═══════════════════════════════════════════════════════════════════════════
// DaoWriteService — on-chain DAO writes (always direct to chain)
// ───────────────────────────────────────────────────────────────────────────
// Proposal lifecycle, ragequit, delegation, navigator onboard, and Poster metadata.
// Every write goes through the shared TxExecutor path (bounded wait, record-before-
// await durability, status-checked receipt). Launch lives in LaunchService.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { executeWrite, confirmTx } from '@/services/utils/TxExecutor'
import DAOShipAbi from '@/config/abi/DAOShip.json'
import {
  getDAOShipContractWithSigner,
  getSharesContractWithSigner,
  getPosterContractWithSigner,
  getERC20TributeNavigatorContractWithSigner,
  getOnboarderNavigatorContractWithSigner,
} from './contracts'

class DaoWriteService {
  /**
   * Submit a new proposal to the DAO.
   *
   * @param daoId         DAOShip contract address
   * @param proposalData  ABI-encoded action data (MultiSend-packed bytes)
   * @param expiration    Expiration timestamp (0 = no expiration)
   * @param details       Human-readable details / IPFS hash
   * @returns The proposal ID
   */
  async submitProposal(
    daoId: string,
    proposalData: string,
    expiration: number,
    details: string,
  ): Promise<bigint> {
    const daoShip = getDAOShipContractWithSigner(daoId)

    // The contract's submitProposal decides self-sponsorship from
    // sharesToken.getPriorVotes(sender, block.timestamp - 1) — PRIOR votes, not current.
    // Using getCurrentVotes() here can over-count power that changed in the current block
    // (mint/delegate/claim same-block), wrongly zeroing the offering and producing a
    // guaranteed revert. Mirror the contract: read prior votes as of the latest block
    // timestamp (a conservative lower bound on block.timestamp - 1 at execution time).
    const signer = baseService.requireSigner()
    const signerAddress = await signer.getAddress()
    // Quai's sharded RPC rejects a shardless `getProvider().getBlock('latest')` with
    // "Invalid shard" (the wallet provider/Pelagus requires explicit shard context — same
    // reason NavigatorService.tryPermitOnboard avoids it). So derive the timepoint from local
    // time instead. getPriorVotes needs a timepoint strictly in the past; the 60s buffer
    // absorbs clock skew (typically <30s) and keeps this a CONSERVATIVE lower bound on the
    // contract's execution-time `getPriorVotes(sender, block.timestamp - 1)` self-sponsorship
    // check — it under-counts at worst (an offering that wasn't strictly needed), never
    // over-counts (which would wrongly zero the offering and guarantee a revert).
    const timepoint = BigInt(Math.floor(Date.now() / 1000) - 60)
    const [votingPower, sponsorThreshold, contractOffering] = await Promise.all([
      daoShip.getPriorVotes(signerAddress, timepoint) as Promise<bigint>,
      daoShip.sponsorThreshold() as Promise<bigint>,
      daoShip.proposalOffering() as Promise<bigint>,
    ])
    const canSelfSponsor = votingPower >= sponsorThreshold
    const effectiveOffering = canSelfSponsor ? 0n : contractOffering

    const overrides = effectiveOffering > 0n ? { value: effectiveOffering } : undefined
    const receipt = await executeWrite({
      contract: daoShip,
      method: 'submitProposal',
      args: [proposalData, expiration, details],
      label: 'Submit Proposal',
      overrides,
      step: `proposal:submit:${daoId.toLowerCase()}`,
    })

    // Parse the SubmitProposal event to extract the proposal ID
    const iface = new quais.Interface(DAOShipAbi)
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
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
    await executeWrite({
      contract: daoShip,
      method: 'sponsorProposal',
      args: [proposalId],
      label: 'Sponsor Proposal',
    })
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
    await executeWrite({
      contract: daoShip,
      method: 'submitVote',
      args: [proposalId, approved],
      label: 'Vote on Proposal',
    })
  }

  /**
   * Process a proposal that has passed voting and grace period.
   *
   * The contract requires the EXACT data for the outcome: a Ready (passing) proposal
   * must be processed with the original action bytes (checked against proposalDataHash),
   * while a Defeated proposal must be closed with empty `0x`. The caller selects which
   * via willProposalPass(), which mirrors the contract's quorum+majority Ready decision.
   * Sending the wrong one reverts with HashMismatch (surfaced as "missing revert data"
   * since Pelagus drops custom-error data during estimateGas).
   *
   * @param daoId        DAOShip contract address
   * @param proposalId   The proposal number to process
   * @param proposalData Original action bytes for a passing proposal, or '0x' to close a defeated one
   */
  async processProposal(daoId: string, proposalId: number, proposalData: string): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    // Workaround: Quai gas estimation follows the try/catch failure path in processProposal,
    // underestimating gas for the inner DelegateCall chain. Add 50% headroom via the
    // gasMultiplier (executeWrite only appends the computed gasLimit when an estimate came
    // back — quais alpha rejects a trailing undefined override).
    // See: daoships-contracts/docs/GAS_ESTIMATION_BUG_REPORT.md
    await executeWrite({
      contract: daoShip,
      method: 'processProposal',
      args: [proposalId, proposalData],
      label: 'Process Proposal',
      gasMultiplier: 150n,
      step: `proposal:process:${daoId.toLowerCase()}:${proposalId}`,
    })
  }

  /**
   * Cancel a proposal (only the submitter can cancel, or anyone if expired).
   *
   * @param daoId       DAOShip contract address
   * @param proposalId  The proposal number to cancel
   */
  async cancelProposal(daoId: string, proposalId: number): Promise<void> {
    const daoShip = getDAOShipContractWithSigner(daoId)
    await executeWrite({
      contract: daoShip,
      method: 'cancelProposal',
      args: [proposalId],
      label: 'Cancel Proposal',
    })
  }

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
    await executeWrite({
      contract: daoShip,
      method: 'ragequit',
      args: [to, sharesToBurn, lootToBurn, tokens],
      label: 'Ragequit',
      step: `ragequit:${daoId.toLowerCase()}`,
    })
  }

  /**
   * Delegate shares voting power to another address.
   *
   * @param sharesAddress  The shares ERC-20 contract address
   * @param delegatee      The address to delegate to (use own address to self-delegate)
   */
  async delegate(sharesAddress: string, delegatee: string): Promise<void> {
    const shares = getSharesContractWithSigner(sharesAddress)
    const tx = await shares.delegate(delegatee)
    await confirmTx(tx, { label: 'Delegate' })
  }

  /**
   * Onboard to a DAO via an ERC20TributeNavigator (pay native token to join).
   *
   * @param navigatorAddress  Address of the ERC20TributeNavigator contract
   * @param value             Amount of native token to send (in wei)
   */
  async onboardEth(navigatorAddress: string, value: bigint): Promise<void> {
    const navigator = getERC20TributeNavigatorContractWithSigner(navigatorAddress)
    const tx = await navigator.onboard({ value })
    await confirmTx(tx, { label: 'Onboard' })
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
    await confirmTx(tx, { label: 'Onboard' })
  }

  /**
   * Post DAO metadata via the Poster.sol contract.
   *
   * @param content  JSON-encoded metadata content
   * @param tag      The tag to categorize this post (e.g. DAO address)
   */
  async post(content: string, tag: string): Promise<void> {
    const poster = getPosterContractWithSigner()
    const tx = await poster['post(string,string)'](content, tag)
    await confirmTx(tx, { label: 'Post metadata' })
  }
}

export const daoWriteService = new DaoWriteService()

// ═══════════════════════════════════════════════════════════════════════════
// Composed governance operations that REFUSE
//
// Every function here exists because the chain accepts something it should not,
// or reports success for something that failed. They are preflights and
// assertions, not conveniences — each one turns a silent bad outcome into a
// thrown error before or immediately after the transaction.
//
// The motivating case: processProposal can complete with a status-1 receipt in
// three materially different states, and until now the client checked only the
// receipt. A retention veto (`passed=false, actionFailed=false`) reads as
// success and leaves a proposal that WON its vote permanently dead —
// STATUS_PROCESSED is set before the veto is evaluated and AlreadyProcessed()
// blocks any retry. There is no second attempt and no path back.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import DAOShipAbi from '@/config/abi/DAOShip.json'
import { getDAOShipContract, getSharesContract, getLootContract } from './contracts'

/** DAOShip.sol ProposalState, by on-chain uint8. Order is contract order. */
export enum OnChainProposalState {
  Unborn = 0,
  Submitted = 1,
  Voting = 2,
  Cancelled = 3,
  Grace = 4,
  Ready = 5,
  Processed = 6,
  Defeated = 7,
  Expired = 8,
}

/** Permission bits from Permissions.sol, exposed as DAOShip constants. */
export const PERMISSION = {
  NONE: 0n,
  ADMIN: 1n,
  MANAGER: 2n,
  GOVERNOR: 4n,
} as const

export class ProposalStateMismatch extends Error {
  constructor(expected: string, actual: OnChainProposalState) {
    super(
      `Proposal is ${OnChainProposalState[actual]} on-chain, not ${expected}. `
      + 'The view you acted from is stale — reload before retrying.',
    )
    this.name = 'ProposalStateMismatch'
  }
}

export class RetentionVetoImminent extends Error {
  constructor(current: bigint, required: bigint) {
    super(
      'Refusing to process: the retention floor is breached. Current shares+loot supply is '
      + `${current}, but ${required} is required (minRetentionPercent of the high-water mark `
      + 'recorded during voting). Processing now would mark the proposal Defeated despite it '
      + 'winning the vote, and it can never be processed again. Wait for supply to recover, or '
      + 'let the proposal expire.',
    )
    this.name = 'RetentionVetoImminent'
  }
}

export class ActionFailed extends Error {
  constructor() {
    super(
      'The proposal passed but its action reverted on execution. The transaction succeeded and '
      + 'the proposal is now Processed — the action did NOT run and cannot be retried.',
    )
    this.name = 'ActionFailed'
  }
}

export class ProposalDidNotPass extends Error {
  constructor() {
    super(
      'The proposal was processed but did not pass. If it won its vote, a retention veto fired: '
      + 'supply fell below the retention floor during grace. It is now permanently Defeated.',
    )
    this.name = 'ProposalDidNotPass'
  }
}

/**
 * Read the authoritative proposal state from the chain.
 *
 * `state(uint32)` is a free `eth_call` and is the only source that cannot be
 * stale. `previewProposalStatus` (the client predicate) is a cache-shaped
 * approximation for rendering lists without an RPC round-trip per row — proven
 * to agree with this in proposalStateDifferential.test.ts, but derived from
 * indexer rows that lag.
 */
export async function readProposalState(
  daoId: string,
  proposalId: number,
): Promise<OnChainProposalState> {
  const daoShip = getDAOShipContract(daoId)
  return Number(await daoShip.state(proposalId)) as OnChainProposalState
}

/**
 * Read the four status flags: [cancelled, processed, passed, actionFailed].
 *
 * Needed because `state()` does NOT report execution outcome — a proposal whose
 * action reverted keeps STATUS_PASSED and therefore still reports `Processed`.
 */
export async function readProposalFlags(
  daoId: string,
  proposalId: number,
): Promise<{ cancelled: boolean; processed: boolean; passed: boolean; actionFailed: boolean }> {
  const daoShip = getDAOShipContract(daoId)
  const flags: boolean[] = await daoShip.getProposalStatus(proposalId)
  return { cancelled: flags[0], processed: flags[1], passed: flags[2], actionFailed: flags[3] }
}

/**
 * Check whether processing right now would trigger the retention veto.
 *
 * The contract re-checks supply at process time:
 *
 *   required = maxTotalSharesAndLootAtVote * minRetentionPercent / 10000
 *   if (sharesTotalSupply + lootTotalSupply < required) passed = false
 *
 * Note the denominator differs from quorum's. Quorum measures against
 * `maxTotalSharesAtSponsor` — shares only, snapshotted at sponsorship. Retention
 * measures against `maxTotalSharesAndLootAtVote` — shares AND loot, a high-water
 * mark that rises during voting. Reusing the quorum snapshot here is wrong.
 */
export async function checkRetentionFloor(
  daoId: string,
  proposalId: number,
): Promise<{ breached: boolean; current: bigint; required: bigint }> {
  const daoShip = getDAOShipContract(daoId)

  const [minRetentionPercent, sharesAddress, lootAddress, proposal] = await Promise.all([
    daoShip.minRetentionPercent() as Promise<bigint>,
    daoShip.sharesToken() as Promise<string>,
    daoShip.lootToken() as Promise<string>,
    daoShip.proposals(proposalId) as Promise<{ maxTotalSharesAndLootAtVote: bigint }>,
  ])

  // minRetentionPercent == 0 disables the veto entirely.
  if (minRetentionPercent === 0n) {
    return { breached: false, current: 0n, required: 0n }
  }

  const [sharesSupply, lootSupply] = await Promise.all([
    getSharesContract(sharesAddress).totalSupply() as Promise<bigint>,
    getLootContract(lootAddress).totalSupply() as Promise<bigint>,
  ])

  const current = sharesSupply + lootSupply
  const required = (proposal.maxTotalSharesAndLootAtVote * minRetentionPercent) / 10000n

  return { breached: current < required, current, required }
}

/**
 * Everything that must hold before `processProposal` is worth sending.
 *
 * Returns the exact `proposalData` the contract will accept, which differs by
 * outcome and is a revert either way if guessed:
 *   Ready    -> the original action bytes, hash-checked
 *   Defeated -> empty '0x', and anything else reverts with HashMismatch
 *
 * Throws rather than returning a "maybe" — every failure here is a transaction
 * the user should not send.
 */
export async function preflightProcess(
  daoId: string,
  proposalId: number,
  originalActionData: string | null | undefined,
): Promise<{ proposalData: string; state: OnChainProposalState }> {
  const state = await readProposalState(daoId, proposalId)

  if (state !== OnChainProposalState.Ready && state !== OnChainProposalState.Defeated) {
    throw new ProposalStateMismatch('Ready or Defeated', state)
  }

  if (state === OnChainProposalState.Defeated) {
    // Closing a defeated proposal is legitimate and costs only gas — no veto to
    // check, because there is no outcome left to lose.
    return { proposalData: '0x', state }
  }

  // Ready: the action bytes must be present and must match the committed hash.
  if (!originalActionData || originalActionData === '0x') {
    throw new Error(
      'Cannot process a Ready proposal without its original action data. The indexer did not '
      + 'return proposal_data — processing with empty data would revert with HashMismatch.',
    )
  }

  const daoShip = getDAOShipContract(daoId)
  const [expectedHash, proposal] = await Promise.all([
    daoShip.hashOperation(originalActionData) as Promise<string>,
    daoShip.proposals(proposalId) as Promise<{ proposalDataHash: string }>,
  ])

  if (expectedHash.toLowerCase() !== proposal.proposalDataHash.toLowerCase()) {
    throw new Error(
      'The action data does not match the hash committed on-chain. Sending it would revert with '
      + 'HashMismatch, which most wallets surface as "missing revert data". The indexer row may '
      + 'be stale or tampered with.',
    )
  }

  const retention = await checkRetentionFloor(daoId, proposalId)
  if (retention.breached) {
    throw new RetentionVetoImminent(retention.current, retention.required)
  }

  return { proposalData: originalActionData, state }
}

/**
 * Assert a processProposal receipt actually did what the user asked.
 *
 * `confirmTx` already throws on a reverted receipt. It cannot catch these,
 * because both produce status 1:
 *   passed=false                 the retention veto fired — proposal is dead
 *   passed=true, actionFailed    the batch reverted — nothing moved
 *
 * Reads the event rather than `state()`, which reports `Processed` in both the
 * success case and the actionFailed case.
 */
export function assertActionSucceeded(receipt: quais.TransactionReceipt): void {
  const iface = new quais.Interface(DAOShipAbi)

  for (const log of receipt.logs) {
    let parsed: quais.LogDescription | null = null
    try {
      parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
    } catch {
      continue // not a DAOShip log
    }
    if (parsed?.name !== 'ProcessProposal') continue

    if (!parsed.args.passed) throw new ProposalDidNotPass()
    if (parsed.args.actionFailed) throw new ActionFailed()
    return
  }

  throw new Error(
    'No ProcessProposal event in the receipt — cannot confirm the proposal was processed. '
    + 'Do not assume success.',
  )
}

/**
 * Extract the new proposal's id from a submitProposal receipt.
 *
 * Without this an agent that submits has no supported way to learn what it
 * created: the id is assigned on-chain and appears only in the event.
 */
export function parseSubmitReceipt(receipt: quais.TransactionReceipt): number {
  const iface = new quais.Interface(DAOShipAbi)

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
      if (parsed?.name === 'SubmitProposal') return Number(parsed.args.proposal)
    } catch {
      continue
    }
  }

  throw new Error('No SubmitProposal event in the receipt — the proposal id is unknown.')
}

/** A permission bitmask as the DAO sees it, plus what it implies. */
export interface Capabilities {
  raw: bigint
  isAdmin: boolean
  isManager: boolean
  isGovernor: boolean
}

/**
 * Read an address's permission bits on a DAO.
 *
 * Navigators hold permissions; ordinary members hold none, and act through
 * proposals instead. `requiresProposal` turns that into a yes/no.
 */
export async function capabilitiesOf(daoId: string, address: string): Promise<Capabilities> {
  const daoShip = getDAOShipContract(daoId)
  const raw = BigInt(await daoShip.navigators(quais.getAddress(address)) as bigint)
  return {
    raw,
    isAdmin: (raw & PERMISSION.ADMIN) !== 0n,
    isManager: (raw & PERMISSION.MANAGER) !== 0n,
    isGovernor: (raw & PERMISSION.GOVERNOR) !== 0n,
  }
}

export type GovernanceAction =
  | 'mintShares' | 'burnShares' | 'mintLoot' | 'burnLoot'
  | 'setGovernanceConfig' | 'setNavigators' | 'setGuildTokens'

/**
 * Whether an action must go through a proposal for this caller.
 *
 * A caller with the right bit can call the DAO directly; everyone else must
 * route through governance. Answering this before building a transaction avoids
 * a revert whose message names a permission the user has never heard of.
 */
export function requiresProposal(action: GovernanceAction, caps: Capabilities): boolean {
  switch (action) {
    case 'mintShares':
    case 'burnShares':
    case 'mintLoot':
    case 'burnLoot':
      return !caps.isManager
    case 'setGovernanceConfig':
    case 'setNavigators':
      return !caps.isGovernor
    case 'setGuildTokens':
      return !caps.isAdmin
  }
}

/**
 * Reject a signer that cannot transact on Cyprus-1 before anything is spent.
 *
 * A key generated with `new Wallet(randomBytes(32))` lands in Cyprus-1 roughly
 * 0.2% of the time. The address looks well-formed either way, so without this
 * the first symptom is a failed transaction.
 */
export function assertUsableSigner(address: string): void {
  if (!quais.isQuaiAddress(address)) {
    throw new Error(`${address} is not a Quai address. Derive keys with quais.QuaiHDWallet.`)
  }
  if (quais.getZoneForAddress(address) !== '0x00') {
    throw new Error(
      `${address} is not in Cyprus-1 (zone ${quais.getZoneForAddress(address)}). `
      + 'Use getNextAddress(0, quais.Zone.Cyprus1).',
    )
  }
}

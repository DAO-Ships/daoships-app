// ═══════════════════════════════════════════════════════════════════════════
// C2: the operations that refuse.
//
// The headline case: processProposal can return a status-1 receipt in three
// materially different states, and confirmTx only ever checked the status. A
// retention veto (`passed=false, actionFailed=false`) therefore read as success
// while leaving a proposal that WON its vote permanently dead — STATUS_PROCESSED
// is set before the veto is evaluated and AlreadyProcessed() blocks every retry.
//
// The live mainnet DAO runs minRetentionPercent = 5000, so this is armed.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quais } from 'quais'
import DAOShipAbi from '@/config/abi/DAOShip.json'

const daoShipMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const sharesMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const lootMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock('../contracts', () => ({
  getDAOShipContract: () => daoShipMock.current,
  getSharesContract: () => sharesMock.current,
  getLootContract: () => lootMock.current,
}))

const {
  readProposalState, readProposalFlags, checkRetentionFloor, preflightProcess,
  assertActionSucceeded, parseSubmitReceipt, capabilitiesOf, requiresProposal,
  assertUsableSigner, OnChainProposalState, RetentionVetoImminent,
  ActionFailed, ProposalDidNotPass, ProposalStateMismatch,
} = await import('../governanceOps')

const DAO = '0x001117dd3c8574bc34227074472fb64349d2c3e9'
const SHARES = '0x001a4f36ead605149A0144C771B7cbf4116753a9'
const LOOT = '0x002abA2592A1111b8EcfFcA98A7f30b8de30cA58'
const ACTION = '0xdeadbeef'

const iface = new quais.Interface(DAOShipAbi)

/** Build a receipt carrying a real, correctly-encoded ProcessProposal log. */
function processReceipt(passed: boolean, actionFailed: boolean): quais.TransactionReceipt {
  const ev = iface.getEvent('ProcessProposal')!
  const encoded = iface.encodeEventLog(ev, [1n, passed, actionFailed, DAO])
  return { status: 1, logs: [{ topics: encoded.topics, data: encoded.data }] } as unknown as quais.TransactionReceipt
}

beforeEach(() => {
  sharesMock.current = { totalSupply: async () => 100n }
  lootMock.current = { totalSupply: async () => 0n }
  daoShipMock.current = {
    state: async () => 5n, // Ready
    getProposalStatus: async () => [false, false, false, false],
    // Mirrors the contract: keccak256(abi.encode(data)) of whatever it is GIVEN.
    // A fixed return would make the hash-mismatch test vacuous.
    hashOperation: async (data: string) =>
      quais.keccak256(quais.AbiCoder.defaultAbiCoder().encode(['bytes'], [data])),
    minRetentionPercent: async () => 0n,
    sharesToken: async () => SHARES,
    lootToken: async () => LOOT,
    proposals: async () => ({
      maxTotalSharesAndLootAtVote: 100n,
      proposalDataHash: quais.keccak256(quais.AbiCoder.defaultAbiCoder().encode(['bytes'], [ACTION])),
    }),
    navigators: async () => 0n,
  }
})

describe('assertActionSucceeded — the two silent failures', () => {
  it('throws on a retention veto that reported a successful receipt', () => {
    // passed=false, actionFailed=false, status 1. The proposal won its vote and
    // is now permanently Defeated. This is the case worth all the machinery.
    expect(() => assertActionSucceeded(processReceipt(false, false)))
      .toThrow(ProposalDidNotPass)
  })

  it('throws when the proposal passed but its action reverted', () => {
    expect(() => assertActionSucceeded(processReceipt(true, true))).toThrow(ActionFailed)
  })

  it('accepts only passed && !actionFailed', () => {
    expect(() => assertActionSucceeded(processReceipt(true, false))).not.toThrow()
  })

  it('refuses to assume success when no ProcessProposal event is present', () => {
    const bare = { status: 1, logs: [] } as unknown as quais.TransactionReceipt
    expect(() => assertActionSucceeded(bare)).toThrow(/cannot confirm/i)
  })

  it('ignores unrelated logs rather than choking on them', () => {
    const good = processReceipt(true, false)
    const noisy = {
      status: 1,
      logs: [{ topics: ['0x' + '11'.repeat(32)], data: '0xabcd' }, ...good.logs],
    } as unknown as quais.TransactionReceipt
    expect(() => assertActionSucceeded(noisy)).not.toThrow()
  })
})

describe('checkRetentionFloor', () => {
  it('reports no breach when the veto is disabled', () => {
    // minRetentionPercent == 0 turns the whole mechanism off.
    return expect(checkRetentionFloor(DAO, 1)).resolves.toMatchObject({ breached: false })
  })

  it('detects a breach when supply fell below the floor', async () => {
    daoShipMock.current.minRetentionPercent = async () => 5000n // 50%
    daoShipMock.current.proposals = async () => ({ maxTotalSharesAndLootAtVote: 200n })
    sharesMock.current.totalSupply = async () => 80n
    lootMock.current.totalSupply = async () => 0n
    // required = 200 * 5000 / 10000 = 100; current = 80 -> breached
    await expect(checkRetentionFloor(DAO, 1)).resolves.toEqual({
      breached: true, current: 80n, required: 100n,
    })
  })

  it('counts shares AND loot, not shares alone', async () => {
    // The retention denominator is maxTotalSharesAndLootAtVote — different from
    // quorum's shares-only maxTotalSharesAtSponsor. Ignoring loot would report a
    // false breach and refuse a perfectly processable proposal.
    daoShipMock.current.minRetentionPercent = async () => 5000n
    daoShipMock.current.proposals = async () => ({ maxTotalSharesAndLootAtVote: 200n })
    sharesMock.current.totalSupply = async () => 60n
    lootMock.current.totalSupply = async () => 40n
    await expect(checkRetentionFloor(DAO, 1)).resolves.toMatchObject({ breached: false, current: 100n })
  })

  it('treats exactly-at-the-floor as not breached', async () => {
    // The contract uses `<`, so equality passes.
    daoShipMock.current.minRetentionPercent = async () => 5000n
    daoShipMock.current.proposals = async () => ({ maxTotalSharesAndLootAtVote: 200n })
    sharesMock.current.totalSupply = async () => 100n
    await expect(checkRetentionFloor(DAO, 1)).resolves.toMatchObject({ breached: false })
  })
})

describe('preflightProcess', () => {
  it('returns the original action bytes for a Ready proposal', async () => {
    await expect(preflightProcess(DAO, 1, ACTION)).resolves.toEqual({
      proposalData: ACTION, state: OnChainProposalState.Ready,
    })
  })

  it('forces empty data for a Defeated proposal', async () => {
    // Anything else reverts with HashMismatch — the contract requires '0x' here.
    daoShipMock.current.state = async () => 7n
    await expect(preflightProcess(DAO, 1, ACTION)).resolves.toEqual({
      proposalData: '0x', state: OnChainProposalState.Defeated,
    })
  })

  it('refuses when the retention floor is breached', async () => {
    daoShipMock.current.minRetentionPercent = async () => 5000n
    daoShipMock.current.proposals = async () => ({
      maxTotalSharesAndLootAtVote: 200n,
      proposalDataHash: quais.keccak256(quais.AbiCoder.defaultAbiCoder().encode(['bytes'], [ACTION])),
    })
    sharesMock.current.totalSupply = async () => 10n
    await expect(preflightProcess(DAO, 1, ACTION)).rejects.toThrow(RetentionVetoImminent)
  })

  it('refuses a state that cannot be processed at all', async () => {
    daoShipMock.current.state = async () => 2n // Voting
    await expect(preflightProcess(DAO, 1, ACTION)).rejects.toThrow(ProposalStateMismatch)
  })

  it('refuses a Ready proposal with no action data rather than reverting on-chain', async () => {
    await expect(preflightProcess(DAO, 1, null)).rejects.toThrow(/without its original action data/)
    await expect(preflightProcess(DAO, 1, '0x')).rejects.toThrow(/without its original action data/)
  })

  it('refuses action data that does not match the committed hash', async () => {
    // A stale or tampered indexer row. On-chain this is HashMismatch, which
    // surfaces to most wallets as the unhelpful "missing revert data".
    await expect(preflightProcess(DAO, 1, '0xfeedface')).rejects.toThrow(/does not match the hash/)
  })
})

describe('parseSubmitReceipt', () => {
  it('extracts the proposal id assigned on-chain', () => {
    const ev = iface.getEvent('SubmitProposal')!
    // proposal, proposalDataHash, submitter, votingPeriod, proposalData,
    // expiration, selfSponsor, timestamp, details, proposalOffering
    const encoded = iface.encodeEventLog(ev, [
      42n, '0x' + '00'.repeat(32), DAO, 0n, '0x', 0n, false, 0n, '', 0n,
    ])
    const receipt = { logs: [{ topics: encoded.topics, data: encoded.data }] } as unknown as quais.TransactionReceipt
    expect(parseSubmitReceipt(receipt)).toBe(42)
  })

  it('throws rather than returning a guessed id', () => {
    const bare = { logs: [] } as unknown as quais.TransactionReceipt
    expect(() => parseSubmitReceipt(bare)).toThrow(/proposal id is unknown/)
  })
})

describe('capabilitiesOf / requiresProposal', () => {
  it('decodes the permission bitmask', async () => {
    daoShipMock.current.navigators = async () => 6n // MANAGER | GOVERNOR
    await expect(capabilitiesOf(DAO, DAO)).resolves.toEqual({
      raw: 6n, isAdmin: false, isManager: true, isGovernor: true,
    })
  })

  it('says an ordinary member must use a proposal for everything', () => {
    const none = { raw: 0n, isAdmin: false, isManager: false, isGovernor: false }
    expect(requiresProposal('mintShares', none)).toBe(true)
    expect(requiresProposal('setGovernanceConfig', none)).toBe(true)
    expect(requiresProposal('setGuildTokens', none)).toBe(true)
  })

  it('maps each action to the bit that actually gates it', () => {
    const manager = { raw: 2n, isAdmin: false, isManager: true, isGovernor: false }
    expect(requiresProposal('mintShares', manager)).toBe(false)
    expect(requiresProposal('setGovernanceConfig', manager)).toBe(true)

    const governor = { raw: 4n, isAdmin: false, isManager: false, isGovernor: true }
    expect(requiresProposal('setGovernanceConfig', governor)).toBe(false)
    expect(requiresProposal('mintShares', governor)).toBe(true)
  })
})

describe('readProposalState / readProposalFlags', () => {
  it('returns the on-chain enum value', async () => {
    await expect(readProposalState(DAO, 1)).resolves.toBe(OnChainProposalState.Ready)
  })

  it('surfaces actionFailed, which state() cannot express', async () => {
    // A proposal whose action reverted keeps STATUS_PASSED, so state() still
    // says Processed. Only the flags distinguish it.
    daoShipMock.current.state = async () => 6n
    daoShipMock.current.getProposalStatus = async () => [false, true, true, true]
    await expect(readProposalState(DAO, 1)).resolves.toBe(OnChainProposalState.Processed)
    await expect(readProposalFlags(DAO, 1)).resolves.toMatchObject({ passed: true, actionFailed: true })
  })
})

describe('assertUsableSigner', () => {
  it('accepts a Cyprus-1 address', () => {
    expect(() => assertUsableSigner(DAO)).not.toThrow()
  })

  it('rejects an address outside Cyprus-1 before anything is spent', () => {
    expect(() => assertUsableSigner('0x1111111111111111111111111111111111111111')).toThrow(/Cyprus-1|not a Quai address/)
  })
})

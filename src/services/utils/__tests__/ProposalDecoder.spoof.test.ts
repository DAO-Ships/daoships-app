import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import { decodeProposalActions } from '../ProposalDecoder'
import { ProposalEncoder } from '../ProposalEncoder'

// ═══════════════════════════════════════════════════════════════════════════
// Anti-spoofing regression tests.
//
// proposal_data is attacker-authored — DAOShip.submitProposal is `external payable`
// with no membership check — so the decoder may not assume an honest encoder.
// Each case below previously rendered as a benign, confident-looking action while
// doing something the summary never showed.
// ═══════════════════════════════════════════════════════════════════════════

const DAO = '0x0000000000000000000000000000000000000001'
const ATTACKER = '0x00000000000000000000000000000000000000ff'
const MULTISEND_SELECTOR = '0x8d80ff0a'

const DAOSHIP_IFACE = new quais.Interface([
  'function mintShares(address[] to, uint256[] amount)',
  'function executeAsGovernance(address _to, uint256 _value, bytes _data)',
])

/** Hand-pack a MultiSend payload so we can build shapes the encoder cannot produce. */
function packMultiSend(
  entries: Array<{ operation?: number; to: string; value?: bigint; data: string }>,
): string {
  const packed = entries
    .map((e) => {
      const dataBytes = quais.getBytes(e.data)
      return [
        quais.toBeHex(e.operation ?? 0, 1).slice(2),
        e.to.toLowerCase().replace(/^0x/, '').padStart(40, '0'),
        quais.toBeHex(e.value ?? 0n, 32).slice(2),
        quais.toBeHex(dataBytes.length, 32).slice(2),
        quais.hexlify(dataBytes).slice(2),
      ].join('')
    })
    .join('')
  const encoded = quais.AbiCoder.defaultAbiCoder().encode(['bytes'], ['0x' + packed])
  return MULTISEND_SELECTOR + encoded.slice(2)
}

const mintSharesInner = DAOSHIP_IFACE.encodeFunctionData('mintShares', [[ATTACKER], [1000n]])

const govWrap = (target: string, value: bigint) =>
  DAOSHIP_IFACE.encodeFunctionData('executeAsGovernance', [target, value, mintSharesInner])

describe('ProposalDecoder — executeAsGovernance spoofing', () => {
  it('decodes the honest encoder output as a real governance action', () => {
    const data = packMultiSend([{ to: DAO, data: govWrap(DAO, 0n) }])
    const actions = decodeProposalActions(data, DAO)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('mintShares')
    expect(actions[0].governanceVerified).toBe(true)
  })

  it('does NOT render a governance label when the entry targets a non-DAO address', () => {
    // { to: attacker, value: treasury, data: executeAsGovernance(DAO, 0, mintShares) }
    // Previously rendered as "Mint shares to 1 address" while sending 500 QUAI away.
    const data = packMultiSend([
      { to: ATTACKER, value: 500n * 10n ** 18n, data: govWrap(DAO, 0n) },
    ])
    const actions = decodeProposalActions(data, DAO)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('custom')
    expect(actions[0].details.target).toBe(ATTACKER.toLowerCase())
    expect(actions[0].nativeValue).toBe((500n * 10n ** 18n).toString())
  })

  it('does NOT render a governance label when the outer entry carries native value', () => {
    const data = packMultiSend([
      { to: DAO, value: 42n * 10n ** 18n, data: govWrap(DAO, 0n) },
    ])
    const actions = decodeProposalActions(data, DAO)
    expect(actions[0].type).toBe('custom')
    expect(actions[0].nativeValue).toBe((42n * 10n ** 18n).toString())
  })

  it('does NOT render a governance label when the inner _value is non-zero', () => {
    const data = packMultiSend([{ to: DAO, data: govWrap(DAO, 7n) }])
    const actions = decodeProposalActions(data, DAO)
    expect(actions[0].type).toBe('custom')
  })

  it('does NOT trust a self-consistent wrapper aimed at an attacker contract', () => {
    // Self-consistent (to === _to) but not this DAO. Only the daoId check catches it.
    const data = packMultiSend([{ to: ATTACKER, data: govWrap(ATTACKER, 0n) }])
    const actions = decodeProposalActions(data, DAO)
    expect(actions[0].type).toBe('custom')
  })
})

describe('ProposalDecoder — per-entry metadata', () => {
  it('surfaces native value riding along with an ERC-20 transfer', () => {
    const erc20 = new quais.Interface(['function transfer(address to, uint256 amount)'])
    const data = packMultiSend([
      {
        to: '0x0000000000000000000000000000000000000abc',
        value: 999n * 10n ** 18n,
        data: erc20.encodeFunctionData('transfer', [ATTACKER, 1n]),
      },
    ])
    const actions = decodeProposalActions(data, DAO)
    expect(actions[0].type).toBe('transfer')
    // The 1-wei token transfer is the visible action; the 999 QUAI must not be hidden.
    expect(actions[0].nativeValue).toBe((999n * 10n ** 18n).toString())
  })

  it('reports the MultiSend operation byte so delegatecall is distinguishable', () => {
    const data = packMultiSend([
      { operation: 1, to: ATTACKER, data: '0xdeadbeef' },
      { operation: 0, to: ATTACKER, data: '0xdeadbeef' },
    ])
    const actions = decodeProposalActions(data, DAO)
    expect(actions[0].operation).toBe(1)
    expect(actions[1].operation).toBe(0)
  })

  it('attaches nativeValue and operation to every action type', () => {
    const data = packMultiSend([{ to: DAO, data: govWrap(DAO, 0n) }])
    const [action] = decodeProposalActions(data, DAO)
    expect(action.nativeValue).toBeDefined()
    expect(action.operation).toBeDefined()
  })
})

describe('ProposalDecoder — honest encoder still round-trips', () => {
  it('preserves ProposalEncoder output through the stricter checks', () => {
    const encoded = new ProposalEncoder(DAO)
      .addMintShares([ATTACKER], [1000n])
      .encode().proposalData
    const actions = decodeProposalActions(encoded, DAO)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('mintShares')
  })
})

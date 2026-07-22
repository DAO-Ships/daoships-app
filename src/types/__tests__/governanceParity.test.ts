import { describe, it, expect } from 'vitest'
import { deriveProposalStatus, quorumStatus, ProposalStatus } from '../proposal'
import type { Proposal } from '../proposal'
import type { DaoExpiryConfig } from '../dao'

// ═══════════════════════════════════════════════════════════════════════════
// Parity with DAOShip.sol `state()` and `_didProposalPass()`.
//
// The client keeps a second, ad-hoc copy of the governance rules. Where the two
// disagree, the UI shows a confident verdict the chain does not share — and the
// resulting processProposal call reverts (a defeated proposal must be closed with
// '0x'; a passing one needs its original action bytes).
// ═══════════════════════════════════════════════════════════════════════════

const HOUR = 3600_000

const CONFIG: DaoExpiryConfig = {
  voting_period: 3600,
  grace_period: 3600,
  default_expiry_window: 86400,
  quorum_percent: '2000', // 20%
}

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  const now = Date.now()
  return {
    id: '0x1-1',
    dao_id: '0x1',
    proposal_id: 1,
    created_at: new Date(now - 5 * HOUR).toISOString(),
    submitter: '0x2',
    tx_hash: '',
    proposal_data_hash: '0x',
    sponsored: true,
    voting_period: 3600,
    // voting and grace both finished
    voting_starts: new Date(now - 4 * HOUR).toISOString(),
    voting_ends: new Date(now - 3 * HOUR).toISOString(),
    grace_ends: new Date(now - 2 * HOUR).toISOString(),
    cancelled: false,
    processed: false,
    action_failed: false,
    passed: false,
    yes_votes: 1,
    no_votes: 0,
    yes_balance: '300',
    no_balance: '0',
    max_total_shares_at_sponsor: '1000',
    max_total_shares_and_loot_at_vote: '5000',
    ...overrides,
  } as Proposal
}

describe('deriveProposalStatus parity with state()', () => {
  it('returns Defeated past grace when the proposal cannot pass', () => {
    // 100 yes of a 1000-share snapshot = 10%, below the 20% quorum.
    // The contract short-circuits: `if (!_didProposalPass(id)) return Defeated`.
    // This branch was missing, so the UI said Ready and processing reverted.
    const p = proposal({ yes_balance: '100' })
    expect(deriveProposalStatus(p, CONFIG)).toBe(ProposalStatus.Defeated)
  })

  it('returns Ready past grace when the proposal did pass', () => {
    // 300 of 1000 = 30%, above quorum, and yes > no.
    expect(deriveProposalStatus(proposal(), CONFIG)).toBe(ProposalStatus.Ready)
  })

  it('returns Defeated, not Expired, for a failing proposal past the expiry window', () => {
    // The contract checks auto-defeat BEFORE M-7 auto-expiry, so a failing proposal
    // stays Defeated (and closeable) forever rather than flipping to Expired and
    // losing its Process affordance.
    const old = Date.now() - 100 * HOUR
    const p = proposal({
      yes_balance: '100',
      voting_ends: new Date(old).toISOString(),
      grace_ends: new Date(old + HOUR).toISOString(),
    })
    expect(deriveProposalStatus(p, CONFIG)).toBe(ProposalStatus.Defeated)
  })

  it('returns Expired for an unsponsored proposal past its explicit expiration', () => {
    // state()'s `prop.sponsor == address(0)` branch checks expiration BEFORE
    // returning Submitted. Returning Submitted advertised a Sponsor button that
    // always reverts.
    const p = proposal({
      sponsored: false,
      expiration: new Date(Date.now() - HOUR).toISOString(),
    })
    expect(deriveProposalStatus(p, CONFIG)).toBe(ProposalStatus.Expired)
  })

  it('still returns Submitted for an unsponsored proposal that has not expired', () => {
    const p = proposal({
      sponsored: false,
      expiration: new Date(Date.now() + HOUR).toISOString(),
    })
    expect(deriveProposalStatus(p, CONFIG)).toBe(ProposalStatus.Submitted)
  })

  it('does not assert Defeated when quorum cannot be evaluated', () => {
    const p = proposal({ yes_balance: '100', max_total_shares_at_sponsor: undefined })
    expect(deriveProposalStatus(p, CONFIG)).not.toBe(ProposalStatus.Defeated)
  })
})

describe('quorumStatus mirrors _didProposalPass', () => {
  it('measures yes-only against the SHARES-ONLY sponsor snapshot', () => {
    // The audit's worked example: 1000 shares + 4000 loot, quorum 20%,
    // yes=100 no=900. The contract threshold is 200 yes-shares → not met.
    // The old sidebar used yes+no (1000) against shares+loot (5000) → "Reached".
    const q = quorumStatus(
      proposal({ yes_balance: '100', no_balance: '900' }),
      '2000',
    )
    expect(q).not.toBeNull()
    expect(q!.threshold).toBe(200n)
    expect(q!.yesBalance).toBe(100n)
    expect(q!.met).toBe(false)
  })

  it('reports no requirement when quorum is zero', () => {
    const q = quorumStatus(proposal(), '0')
    expect(q!.required).toBe(false)
    expect(q!.met).toBe(true)
  })

  it('returns null rather than guessing when the snapshot is missing', () => {
    expect(quorumStatus(proposal({ max_total_shares_at_sponsor: undefined }), '2000')).toBeNull()
  })
})

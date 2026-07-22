import { describe, it, expect } from 'vitest'
import type { Proposal } from '@/types'
import { willProposalPass } from '@/types/proposal'

// ═══════════════════════════════════════════════════════════════════════════
// The fail-loud contract.
//
// The dominant stability theme in the audit: a read helper converted a failure into
// a legitimate-looking empty/zero value, so the UI could not tell "nothing" from
// "could not load". indexerError.ts was built precisely because "views showed an
// EMPTY state when the indexer was actually down" — and every throw was then
// re-swallowed one layer up.
// ═══════════════════════════════════════════════════════════════════════════

function baseProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: '0x1-1',
    dao_id: '0x1',
    proposal_id: 1,
    created_at: new Date().toISOString(),
    submitter: '0x2',
    tx_hash: '',
    proposal_data_hash: '0x',
    sponsored: true,
    voting_period: 100,
    cancelled: false,
    processed: false,
    action_failed: false,
    passed: false,
    yes_votes: 1,
    no_votes: 0,
    yes_balance: '100',
    no_balance: '0',
    max_total_shares_and_loot_at_vote: '1000',
    ...overrides,
  } as Proposal
}

describe('quorum snapshot must not silently collapse to zero', () => {
  it('a missing sponsor snapshot does not make every yes>no proposal pass', () => {
    // getProposalFromChain used to write maxTotalSharesAtSponsor into the AT-VOTE
    // field and leave max_total_shares_at_sponsor undefined. willProposalPass reads
    // `BigInt(max_total_shares_at_sponsor || '0')`, so the quorum threshold became 0
    // and any yes>no proposal was predicted to pass — driving a wrong-branch
    // processProposal call and a HashMismatch revert.
    const withSnapshot = willProposalPass(
      baseProposal({ max_total_shares_at_sponsor: '1000' }),
      2000n, // 20% quorum
    )
    // 100 yes against a 1000-share snapshot is 10% — below a 20% quorum.
    expect(withSnapshot).toBe(false)

    // With no snapshot it must REFUSE rather than fabricate a verdict. Returning
    // `true` here (threshold 0) is what drove wrong-branch processProposal calls.
    expect(() =>
      willProposalPass(baseProposal({ max_total_shares_at_sponsor: undefined }), 2000n),
    ).toThrow(/max_total_shares_at_sponsor is missing/)
  })

  it('still evaluates a zero-quorum DAO without needing the snapshot', () => {
    expect(
      willProposalPass(baseProposal({ max_total_shares_at_sponsor: undefined }), 0n),
    ).toBe(true)
  })

  it('honours quorum when the snapshot is present', () => {
    // 300 of 1000 shares = 30%, above a 20% quorum, and yes > no.
    expect(
      willProposalPass(
        baseProposal({ yes_balance: '300', max_total_shares_at_sponsor: '1000' }),
        2000n,
      ),
    ).toBe(true)
  })
})

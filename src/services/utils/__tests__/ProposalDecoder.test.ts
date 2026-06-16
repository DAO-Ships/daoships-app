import { describe, it, expect } from 'vitest'
import { decodeProposalActions } from '../ProposalDecoder'
import { ProposalEncoder } from '../ProposalEncoder'
import { buildQueueChangeAction } from '@/utils/timelockProposals'

const DAO = '0x0000000000000000000000000000000000000001'
const TIMELOCK = '0x0000000000000000000000000000000000000abc'

const CONFIG = {
  votingPeriod: 259200, // 3 days
  gracePeriod: 86400, // 1 day
  proposalOffering: 1_000000000000000000n, // 1 QUAI
  quorumPercent: 2000n, // 20%
  sponsorThreshold: 5_000000000000000000n, // 5 shares
  minRetentionPercent: 4000n, // 40%
  defaultExpiryWindow: 604800, // 7 days
}

const EXPECTED_DETAILS = {
  votingPeriod: 259200,
  gracePeriod: 86400,
  proposalOffering: '1000000000000000000',
  quorumPercent: '2000',
  sponsorThreshold: '5000000000000000000',
  minRetentionPercent: '4000',
  defaultExpiryWindow: 604800,
}

describe('decodeProposalActions — governance config', () => {
  it('breaks a direct setGovernanceConfig change into its parameters', () => {
    const data = new ProposalEncoder(DAO).addSetGovernanceConfig(CONFIG).encode().proposalData
    const actions = decodeProposalActions(data)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('setGovernanceConfig')
    expect(actions[0].details.config).toEqual(EXPECTED_DETAILS)
  })

  it('decodes a timelock queueChange into a queued governance-config change with parameters', () => {
    const action = buildQueueChangeAction(TIMELOCK, CONFIG)
    const data = new ProposalEncoder(DAO).addCustomAction(action.to, 0n, action.data).encode().proposalData
    const actions = decodeProposalActions(data)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('queueGovernanceConfig')
    expect(actions[0].details.config).toEqual(EXPECTED_DETAILS)
  })
})

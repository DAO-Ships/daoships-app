import { describe, it, expect } from 'vitest'
import { encodeGovernanceConfig } from '../GovernanceEncoder'

describe('encodeGovernanceConfig', () => {
  const validConfig = {
    votingPeriod: 259200, // 3 days
    gracePeriod: 86400, // 1 day
    proposalOffering: 0n,
    quorumPercent: 0n,
    sponsorThreshold: 1n,
    minRetentionPercent: 0n,
    defaultExpiryWindow: 0,
  }

  it('produces a non-empty hex string starting with 0x for valid 7-param config', () => {
    const result = encodeGovernanceConfig(validConfig)
    expect(result).toMatch(/^0x[0-9a-fA-F]+$/)
    expect(result.length).toBeGreaterThan(2)
  })

  it('rejects votingPeriod < 60', () => {
    expect(() =>
      encodeGovernanceConfig({ ...validConfig, votingPeriod: 59 }),
    ).toThrow(/votingPeriod/)
  })

  it('rejects votingPeriod > 4294967295 (uint32 max)', () => {
    expect(() =>
      encodeGovernanceConfig({ ...validConfig, votingPeriod: 4_294_967_296 }),
    ).toThrow(/votingPeriod/)
  })

  it('rejects quorumPercent > 10000', () => {
    expect(() =>
      encodeGovernanceConfig({ ...validConfig, quorumPercent: 10001n }),
    ).toThrow(/quorumPercent/)
  })

  it('rejects minRetentionPercent > 10000', () => {
    expect(() =>
      encodeGovernanceConfig({ ...validConfig, minRetentionPercent: 10001n }),
    ).toThrow(/minRetentionPercent/)
  })

  it('accepts defaultExpiryWindow = 0', () => {
    const result = encodeGovernanceConfig({
      ...validConfig,
      defaultExpiryWindow: 0,
    })
    expect(result).toMatch(/^0x/)
  })

  it('accepts defaultExpiryWindow = 86400', () => {
    const result = encodeGovernanceConfig({
      ...validConfig,
      defaultExpiryWindow: 86400,
    })
    expect(result).toMatch(/^0x/)
  })

  it('rejects negative gracePeriod', () => {
    expect(() =>
      encodeGovernanceConfig({ ...validConfig, gracePeriod: -1 }),
    ).toThrow(/gracePeriod/)
  })
})

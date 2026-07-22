import { describe, it, expect } from 'vitest'
import {
  encodeGovernanceConfig,
  MAX_VOTING_PERIOD,
  MAX_GRACE_PERIOD,
} from '@/services/utils/GovernanceEncoder'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'

const BASE = {
  votingPeriod: 259200,
  gracePeriod: 86400,
  proposalOffering: 10n ** 18n,
  quorumPercent: 2000n,
  sponsorThreshold: 5n * 10n ** 18n,
  minRetentionPercent: 0n,
  defaultExpiryWindow: 604800,
}

describe('governance period bounds mirror the contract', () => {
  it('exposes the contract constants (DAOShip.sol:73,76 — 365 days)', () => {
    expect(MAX_VOTING_PERIOD).toBe(31_536_000)
    expect(MAX_GRACE_PERIOD).toBe(31_536_000)
  })

  it('rejects a voting period above MAX_VOTING_PERIOD', () => {
    // Previously bounded only by uint32 (~136 years), so an over-long period passed a
    // full voting+grace cycle and reverted at processProposal, burning the offering.
    expect(() => encodeGovernanceConfig({ ...BASE, votingPeriod: MAX_VOTING_PERIOD + 1 }))
      .toThrow(/365 days/)
  })

  it('rejects a grace period above MAX_GRACE_PERIOD', () => {
    expect(() => encodeGovernanceConfig({ ...BASE, gracePeriod: MAX_GRACE_PERIOD + 1 }))
      .toThrow(/365 days/)
  })

  it('accepts values exactly at the maximum', () => {
    expect(() => encodeGovernanceConfig({
      ...BASE,
      votingPeriod: MAX_VOTING_PERIOD,
      gracePeriod: MAX_GRACE_PERIOD,
    })).not.toThrow()
  })

  it('still enforces the 60-second minimum', () => {
    expect(() => encodeGovernanceConfig({ ...BASE, votingPeriod: 59 })).toThrow()
  })
})

describe('governance config display round-trip is lossless', () => {
  // GovernanceForm prefills every field and setGovernanceConfig rewrites ALL SEVEN on
  // submit, so a truncating prefill silently rewrote untouched parameters.
  it('preserves a sub-0.0001 proposal offering', () => {
    const original = 50_000_000_000_000n // 5e13 wei
    // The old prefill used maxDecimals 4, producing the literal string "0."
    expect(formatTokenAmount(original, 18, 4, 0)).toBe('0.')
    expect(parseTokenAmount('0.')).toBe(0n)

    // Full precision round-trips exactly.
    const displayed = formatTokenAmount(original, 18, 18, 0)
    expect(parseTokenAmount(displayed)).toBe(original)
  })

  it('preserves full 18-decimal precision', () => {
    const original = 1_234_567_890_123_456_789n
    expect(parseTokenAmount(formatTokenAmount(original, 18, 18, 0))).toBe(original)
  })

  it('still renders whole values without a decimal tail', () => {
    expect(formatTokenAmount(10n ** 18n, 18, 18, 0)).toBe('1')
  })
})

describe('ragequit retention cap mirrors DAOShip.sol:1572-1574', () => {
  // if (currentTotalSupply - totalToBurn < (currentTotalSupply * minRetentionPercent) / 10000)
  //     revert InsufficientRetention();
  const maxBurnable = (totalSupply: bigint, bps: bigint) => {
    const minRetention = (totalSupply * bps) / 10000n
    return totalSupply > minRetention ? totalSupply - minRetention : 0n
  }

  it('permits burning everything when no retention is configured', () => {
    expect(maxBurnable(1000n, 0n)).toBe(1000n)
  })

  it('caps the burn at supply minus the retention floor', () => {
    // 40% retention of 1000 → 400 must remain → at most 600 burnable.
    expect(maxBurnable(1000n, 4000n)).toBe(600n)
  })

  it('permits nothing at 100% retention', () => {
    expect(maxBurnable(1000n, 10000n)).toBe(0n)
  })
})

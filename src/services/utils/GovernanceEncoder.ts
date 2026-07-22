// ═══════════════════════════════════════════════════════════════════════════
// Governance Config ABI Encoder
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

const UINT32_MAX = 4_294_967_295

/**
 * Governance configuration parameters matching the DAOShip contract's
 * setGovernanceConfig(bytes) format.
 *
 * Solidity decoding:
 *   abi.decode(_governanceConfig, (uint32, uint32, uint256, uint256, uint256, uint256, uint32))
 */
export interface GovernanceConfig {
  /** Voting period in seconds (uint32). Min: 60, Max: 4,294,967,295 */
  votingPeriod: number
  /** Grace period in seconds (uint32). Min: 0, Max: 4,294,967,295 */
  gracePeriod: number
  /** Offering required to submit a proposal (uint256, in wei) */
  proposalOffering: bigint
  /** Quorum percentage in basis points, 0-10000 (uint256) */
  quorumPercent: bigint
  /** Minimum shares required to sponsor a proposal (uint256) */
  sponsorThreshold: bigint
  /** Minimum retention percentage in basis points, 0-10000 (uint256) */
  minRetentionPercent: bigint
  /** Default expiry window in seconds (uint32). 0 = use 2*(voting+grace) fallback */
  defaultExpiryWindow: number
}

/**
 * ABI-encode governance config parameters for DAOShip.setGovernanceConfig(bytes).
 *
 * @param config - Governance configuration object
 * @returns ABI-encoded hex string
 * @throws Error if parameters are out of range
 */
/**
 * Contract-enforced upper bounds, mirroring DAOShip.sol:73,76
 *   uint32 public constant MAX_VOTING_PERIOD = 31_536_000;  // 365 days
 *   uint32 public constant MAX_GRACE_PERIOD  = 31_536_000;  // 365 days
 *
 * Both are in the ABI and were referenced NOWHERE in the client, so a proposal could
 * pass a full voting+grace cycle and only then revert at processProposal — burning the
 * offering and landing as ActionFailed.
 */
export const MAX_VOTING_PERIOD = 31_536_000
export const MAX_GRACE_PERIOD = 31_536_000

export function encodeGovernanceConfig(config: GovernanceConfig): string {
  // Validate uint32 fields
  if (config.votingPeriod < 60 || config.votingPeriod > MAX_VOTING_PERIOD) {
    throw new Error(`votingPeriod must be between 60 and ${MAX_VOTING_PERIOD} seconds (365 days)`)
  }
  if (config.gracePeriod < 0 || config.gracePeriod > MAX_GRACE_PERIOD) {
    throw new Error(`gracePeriod must be between 0 and ${MAX_GRACE_PERIOD} seconds (365 days)`)
  }
  if (config.defaultExpiryWindow < 0 || config.defaultExpiryWindow > UINT32_MAX) {
    throw new Error(`defaultExpiryWindow must be between 0 and ${UINT32_MAX}`)
  }

  // Validate basis point fields
  if (config.quorumPercent < 0n || config.quorumPercent > 10000n) {
    throw new Error('quorumPercent must be between 0 and 10000 (basis points)')
  }
  if (config.minRetentionPercent < 0n || config.minRetentionPercent > 10000n) {
    throw new Error('minRetentionPercent must be between 0 and 10000 (basis points)')
  }

  const abiCoder = quais.AbiCoder.defaultAbiCoder()
  return abiCoder.encode(
    ['uint32', 'uint32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint32'],
    [
      config.votingPeriod,
      config.gracePeriod,
      config.proposalOffering,
      config.quorumPercent,
      config.sponsorThreshold,
      config.minRetentionPercent,
      config.defaultExpiryWindow,
    ],
  )
}

/**
 * Decode a governance-config bytes blob (from setGovernanceConfig / timelock queueChange) back
 * into its parameters. Inverse of encodeGovernanceConfig. Returns null if the bytes don't match
 * the expected 7-field tuple (e.g. a future/legacy layout) so callers can fall back gracefully.
 */
export function decodeGovernanceConfig(configBytes: string): GovernanceConfig | null {
  if (!configBytes || configBytes === '0x') return null
  try {
    const abiCoder = quais.AbiCoder.defaultAbiCoder()
    const [
      votingPeriod, gracePeriod, proposalOffering, quorumPercent,
      sponsorThreshold, minRetentionPercent, defaultExpiryWindow,
    ] = abiCoder.decode(
      ['uint32', 'uint32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint32'],
      configBytes,
    )
    return {
      votingPeriod: Number(votingPeriod),
      gracePeriod: Number(gracePeriod),
      proposalOffering: BigInt(proposalOffering),
      quorumPercent: BigInt(quorumPercent),
      sponsorThreshold: BigInt(sponsorThreshold),
      minRetentionPercent: BigInt(minRetentionPercent),
      defaultExpiryWindow: Number(defaultExpiryWindow),
    }
  } catch {
    return null
  }
}

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
export function encodeGovernanceConfig(config: GovernanceConfig): string {
  // Validate uint32 fields
  if (config.votingPeriod < 60 || config.votingPeriod > UINT32_MAX) {
    throw new Error(`votingPeriod must be between 60 and ${UINT32_MAX}`)
  }
  if (config.gracePeriod < 0 || config.gracePeriod > UINT32_MAX) {
    throw new Error(`gracePeriod must be between 0 and ${UINT32_MAX}`)
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

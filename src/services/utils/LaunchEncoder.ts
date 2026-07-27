// ═══════════════════════════════════════════════════════════════════════════
// LaunchEncoder — the 13-field initializationParamsTemplate
//
// This is the outer blob passed to DAOShipAndVaultLauncher.launchDAOShipAndVault.
// It wraps the 7-field governance config, which has had a validating codec
// (GovernanceEncoder) for some time; this one lived inline in a React hook with
// no validation and no test, which left the launch encoding half-factored — and
// the unfactored half is the larger one.
//
// The failure mode has precedent here. Getting the governance config's field
// COUNT wrong (6 vs 7) caused a fatal `abi.decode` revert during DAO
// initialization, with no clearer signal than a failed transaction. The same
// hazard applies to all 13 fields below, on the most expensive and least
// reversible operation in the system: by the time it reverts, any navigators in
// the launch pipeline have already been deployed and paid for.
//
// FIELD ORDER IS A CONSENSUS-CRITICAL CONSTANT. It must match
// DAOShip.setUp()'s abi.decode exactly. launchEncoder.test.ts pins it, and
// docsParity.test.ts asserts the published tutorial still describes the same
// list — the docs are where external integrators copy from, and prose duplicated
// from code drifts.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

/**
 * The ABI types of `initializationParamsTemplate`, in order.
 *
 * Exported so tests and documentation can assert against one definition rather
 * than a transcription of it.
 */
export const INIT_PARAMS_TYPES = [
  'address',   //  0 lootToken            — placeholder, factory overwrites
  'address',   //  1 sharesToken          — placeholder, factory overwrites
  'address',   //  2 avatar               — placeholder, factory overwrites with the vault
  'address',   //  3 multisendLibrary
  'bytes',     //  4 governanceConfig     — the 7-field blob from GovernanceEncoder
  'address[]', //  5 navigators
  'uint256[]', //  6 navigatorPermissions
  'address[]', //  7 initMembers
  'uint256[]', //  8 initShareAmounts
  'uint256[]', //  9 initLootAmounts
  'address[]', // 10 guildTokens
  'bool',      // 11 pauseSharesOnLaunch
  'bool',      // 12 pauseLootOnLaunch
] as const

/** Human-readable field names, index-aligned with INIT_PARAMS_TYPES. */
export const INIT_PARAMS_FIELDS = [
  'lootToken', 'sharesToken', 'avatar', 'multisendLibrary', 'governanceConfig',
  'navigators', 'navigatorPermissions', 'initMembers', 'initShareAmounts',
  'initLootAmounts', 'guildTokens', 'pauseSharesOnLaunch', 'pauseLootOnLaunch',
] as const

/**
 * The first three fields are placeholders.
 *
 * The launcher deploys the tokens and vault, then overwrites indices 0–2 before
 * calling setUp. Passing real addresses here does nothing; passing anything
 * other than a valid address breaks the encode.
 */
export const PLACEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface LaunchInitParams {
  multisendLibrary: string
  /** ABI-encoded 7-field blob — build it with GovernanceEncoder, not by hand. */
  governanceConfig: string
  navigators: string[]
  navigatorPermissions: bigint[]
  /** Parallel arrays: index i of each describes the same member. */
  initMembers: string[]
  initShareAmounts: bigint[]
  initLootAmounts: bigint[]
  guildTokens: string[]
  pauseSharesOnLaunch: boolean
  pauseLootOnLaunch: boolean
}

/**
 * Validate what the encoder can check before the chain does.
 *
 * Everything here reverts on-chain if it slips through, and on-chain is a bad
 * place to find out — the launch is one transaction and the navigators that
 * preceded it are already deployed.
 */
export function validateLaunchInitParams(p: LaunchInitParams): void {
  // The contract's LengthMismatch. These three arrays are read positionally, so
  // a short one silently mints the wrong amounts to the wrong members if it
  // survives at all.
  const { initMembers, initShareAmounts, initLootAmounts } = p
  if (
    initMembers.length !== initShareAmounts.length
    || initMembers.length !== initLootAmounts.length
  ) {
    throw new Error(
      'initMembers, initShareAmounts and initLootAmounts must be the same length '
      + `(got ${initMembers.length}, ${initShareAmounts.length}, ${initLootAmounts.length}). `
      + 'They are parallel arrays — index i of each describes the same member.',
    )
  }

  if (p.navigators.length !== p.navigatorPermissions.length) {
    throw new Error(
      'navigators and navigatorPermissions must be the same length '
      + `(got ${p.navigators.length}, ${p.navigatorPermissions.length}).`,
    )
  }

  // The contract's TokensNotSorted: guild tokens must be strictly ascending, and
  // it checks rather than sorts.
  const lower = p.guildTokens.map((t) => t.toLowerCase())
  for (let i = 1; i < lower.length; i++) {
    if (lower[i] <= lower[i - 1]) {
      throw new Error(
        'guildTokens must be in strictly ascending address order with no duplicates — '
        + `${p.guildTokens[i]} follows ${p.guildTokens[i - 1]}. The contract rejects `
        + 'unsorted lists rather than sorting them.',
      )
    }
  }

  if (!p.governanceConfig || p.governanceConfig === '0x') {
    throw new Error(
      'governanceConfig is empty. It must be the 7-field ABI-encoded blob from '
      + 'encodeGovernanceConfig — DAOShip.setUp abi.decodes it and a short blob reverts '
      + 'during initialization with no clearer signal than a failed transaction.',
    )
  }
}

/**
 * Encode `initializationParamsTemplate` for `launchDAOShipAndVault`.
 *
 * Indices 0–2 are emitted as placeholders; the launcher overwrites them with the
 * real token and vault addresses before `setUp` runs.
 */
export function encodeLaunchInitParams(p: LaunchInitParams): string {
  validateLaunchInitParams(p)

  return quais.AbiCoder.defaultAbiCoder().encode([...INIT_PARAMS_TYPES], [
    PLACEHOLDER_ADDRESS, // lootToken   — overwritten by the launcher
    PLACEHOLDER_ADDRESS, // sharesToken — overwritten by the launcher
    PLACEHOLDER_ADDRESS, // avatar      — overwritten by the launcher
    p.multisendLibrary,
    p.governanceConfig,
    p.navigators,
    p.navigatorPermissions,
    p.initMembers,
    p.initShareAmounts,
    p.initLootAmounts,
    p.guildTokens,
    p.pauseSharesOnLaunch,
    p.pauseLootOnLaunch,
  ])
}

/**
 * Decode a template back into its fields.
 *
 * Exists so a caller can verify what it is about to sign, and so the round trip
 * is testable — an encoder with no decoder can only be checked against itself.
 */
export function decodeLaunchInitParams(encoded: string): LaunchInitParams & {
  lootToken: string
  sharesToken: string
  avatar: string
} {
  const d = quais.AbiCoder.defaultAbiCoder().decode([...INIT_PARAMS_TYPES], encoded)
  return {
    lootToken: d[0] as string,
    sharesToken: d[1] as string,
    avatar: d[2] as string,
    multisendLibrary: d[3] as string,
    governanceConfig: d[4] as string,
    navigators: [...(d[5] as string[])],
    navigatorPermissions: [...(d[6] as bigint[])],
    initMembers: [...(d[7] as string[])],
    initShareAmounts: [...(d[8] as bigint[])],
    initLootAmounts: [...(d[9] as bigint[])],
    guildTokens: [...(d[10] as string[])],
    pauseSharesOnLaunch: d[11] as boolean,
    pauseLootOnLaunch: d[12] as boolean,
  }
}

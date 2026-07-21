// ═══════════════════════════════════════════════════════════════════════════
// Launch Gas Estimator
//
// Estimates the QUAI cost of a full DAO launch before the first transaction
// is signed, so the wizard can show the spend up front and block a launch
// that would strand a half-deployed DAO when the wallet runs dry mid-pipeline.
//
// Two layers:
//   1. A model (this file's constants) used on the Review step, where the
//      CREATE2 salts have not been mined yet and nothing can be simulated.
//   2. Exact `estimateGas` guards run by the services immediately before each
//      on-chain transaction (see assertAffordable).
//
// Calibration — Quai mainnet (chain 9), DAO 0x001117dd…C3e9, blocks 9153192-9153206:
//   deploy OnboarderNavigator      7235 code bytes  1,426,553 gas
//   deploy ERC20TributeNavigator   6043 code bytes  1,219,292 gas
//   launchDAOShipAndVault (3 members, 2 guild tokens, 2 navigators, 3 vault
//                          owners)                  1,500,465 gas
//   Poster.post (DAO profile, ~205 bytes)              30,191 gas
// The two navigator deploys fit gas = 168,400 + 173.9 × codeBytes almost
// exactly, which is the linear model used below.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { NETWORK_CONFIG } from '@/config/contracts'
import { formatTokenAmount } from '@/utils/format'

// ── Model constants ───────────────────────────────────────────────────────

/** Fixed overhead of a contract-creation transaction (21k tx + 32k create + constructor). */
const DEPLOY_BASE_GAS = 175_000n
/** Marginal gas per byte of creation bytecode (code deposit + calldata). */
const DEPLOY_GAS_PER_CODE_BYTE = 180n
/** Marginal gas per byte of ABI-encoded constructor arguments. */
const DEPLOY_GAS_PER_ARG_BYTE = 40n

/** launchDAOShipAndVault: proxies + vault + DAOShip setUp, excluding per-item work. */
const LAUNCH_BASE_GAS = 900_000n
const LAUNCH_GAS_PER_MEMBER = 140_000n
const LAUNCH_GAS_PER_GUILD_TOKEN = 50_000n
const LAUNCH_GAS_PER_NAVIGATOR = 30_000n
const LAUNCH_GAS_PER_VAULT_OWNER = 30_000n

/**
 * Stand-in for the launch transaction's gas when it cannot be simulated —
 * comfortably above the 1.5M measured for a 3-member, 2-navigator DAO, since
 * an under-estimate here would let a doomed launch through the guard.
 */
export const FALLBACK_LAUNCH_GAS = 2_500_000n

/** Poster.post: base call plus per-byte calldata/log cost. */
const POST_BASE_GAS = 26_000n
const POST_GAS_PER_CONTENT_BYTE = 30n

/**
 * Headroom applied to the modeled total shown on the Review step. The model is
 * fitted to one mainnet launch; block deposits and gas-price drift between
 * quoting and signing make a bare estimate too tight to gate on.
 */
export const ESTIMATE_BUFFER_PERCENT = 20n

/** Balance within this margin of the estimate gets an amber "cutting it close" warning. */
export const LOW_BALANCE_WARN_PERCENT = 25n

// ── Gas models ────────────────────────────────────────────────────────────

/** Byte length of a `0x`-prefixed hex string. */
function hexByteLength(hex: string): number {
  return hex.startsWith('0x') ? (hex.length - 2) / 2 : hex.length / 2
}

/**
 * Model the gas for deploying a navigator contract.
 *
 * @param creationBytecode - The `0x`-prefixed creation bytecode
 * @param encodedArgs      - The `0x`-prefixed ABI-encoded constructor args, if known
 */
export function modelDeployGas(creationBytecode: string, encodedArgs = '0x'): bigint {
  return (
    DEPLOY_BASE_GAS +
    DEPLOY_GAS_PER_CODE_BYTE * BigInt(hexByteLength(creationBytecode)) +
    DEPLOY_GAS_PER_ARG_BYTE * BigInt(hexByteLength(encodedArgs))
  )
}

export interface LaunchTxShape {
  memberCount: number
  guildTokenCount: number
  navigatorCount: number
  vaultOwnerCount: number
}

/** Model the gas for the launchDAOShipAndVault transaction. */
export function modelLaunchGas(shape: LaunchTxShape): bigint {
  return (
    LAUNCH_BASE_GAS +
    LAUNCH_GAS_PER_MEMBER * BigInt(Math.max(0, shape.memberCount)) +
    LAUNCH_GAS_PER_GUILD_TOKEN * BigInt(Math.max(0, shape.guildTokenCount)) +
    LAUNCH_GAS_PER_NAVIGATOR * BigInt(Math.max(0, shape.navigatorCount)) +
    LAUNCH_GAS_PER_VAULT_OWNER * BigInt(Math.max(0, shape.vaultOwnerCount))
  )
}

/** Model the gas for a Poster.post call carrying `contentBytes` of JSON. */
export function modelPostGas(contentBytes: number): bigint {
  return POST_BASE_GAS + POST_GAS_PER_CONTENT_BYTE * BigInt(Math.max(0, contentBytes))
}

// ── Live chain reads ──────────────────────────────────────────────────────

/**
 * Current gas price via the wallet provider, or null when it cannot be
 * determined. Never throws — a missing gas price downgrades the UI to
 * "cost unknown" rather than blocking the launch.
 *
 * The zone is derived from `address` when given: shardless calls are rejected
 * by Quai wallet providers ("Invalid shard").
 */
export async function getGasPrice(address?: string): Promise<bigint | null> {
  if (!baseService.hasProvider()) return null
  try {
    const zone = address ? quais.getZoneForAddress(address) ?? undefined : undefined
    const feeData = await baseService.getProvider().getFeeData(zone)
    return feeData.gasPrice ?? null
  } catch (err) {
    console.warn('[LaunchGasEstimator] Could not determine gas price:', err)
    return null
  }
}

/** Native QUAI balance of `address`, or null if it cannot be read. */
export async function getNativeBalance(address: string): Promise<bigint | null> {
  if (!baseService.hasProvider()) return null
  try {
    return await baseService.getProvider().getBalance(quais.getAddress(address))
  } catch (err) {
    console.warn('[LaunchGasEstimator] Could not read wallet balance:', err)
    return null
  }
}

// ── Pre-transaction affordability guard ───────────────────────────────────

/**
 * Throw a user-facing error when the connected wallet cannot cover
 * `gas × gasPrice` for the transaction that is about to be signed.
 *
 * Called by the launch services immediately before sending, so a launch that
 * would run out of QUAI halfway stops before it deploys anything further.
 * Silently returns when gas, gas price, or balance cannot be determined —
 * this guard only ever converts a *known* shortfall into a clear message.
 *
 * @param gasEstimate - Gas for the pending transaction (exact estimate preferred)
 * @param label       - Human name of the step, e.g. 'Deploy Onboarder Navigator'
 * @param value       - Native value attached to the transaction, if any
 */
export async function assertAffordable(
  gasEstimate: bigint | null | undefined,
  label: string,
  value = 0n,
): Promise<void> {
  if (!gasEstimate || gasEstimate <= 0n) return

  const signer = baseService.getSigner()
  if (!signer) return

  let from: string
  try {
    from = await signer.getAddress()
  } catch {
    return
  }

  const [gasPrice, balance] = await Promise.all([getGasPrice(from), getNativeBalance(from)])
  if (gasPrice == null || balance == null) return

  const required = gasEstimate * gasPrice + value
  if (balance >= required) return

  const symbol = NETWORK_CONFIG.nativeCurrency.symbol
  throw new Error(
    `Not enough ${symbol} for "${label}". This step needs about ` +
      `${formatTokenAmount(required, 18, 3, 2)} ${symbol} in gas but your wallet holds ` +
      `${formatTokenAmount(balance, 18, 3, 2)} ${symbol}. Top up and retry this step — ` +
      `nothing has been sent yet, and completed steps are preserved.`,
  )
}

/**
 * Estimate gas for a prepared transaction request through the wallet provider.
 * Returns null when the provider cannot simulate it (Pelagus frequently
 * refuses to estimate contract creations), letting callers fall back to the
 * model rather than blocking on an unknowable number.
 */
export async function estimateTxGas(
  tx: quais.TransactionRequest,
  label: string,
): Promise<bigint | null> {
  if (!baseService.hasProvider()) return null
  try {
    return await baseService.getProvider().estimateGas(tx)
  } catch (err) {
    console.warn(`[LaunchGasEstimator] Could not estimate gas for "${label}":`, err)
    return null
  }
}

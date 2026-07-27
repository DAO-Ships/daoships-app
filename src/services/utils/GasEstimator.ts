// ═══════════════════════════════════════════════════════════════════════════
// Gas Estimation Utility
//
// Pre-validates transactions by estimating gas before prompting the wallet.
// This catches contract reverts early and provides user-friendly error
// messages instead of opaque wallet errors.
//
// When the wallet's RPC bridge does not return revert data (e.g. Pelagus
// wraps all failures as code 4001), the estimator yields instead of
// blocking — the wallet will perform its own simulation at signing time.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { parseTransactionError } from './TransactionErrorHandler'
import DAOShipAbi from '@/config/abi/DAOShip.json'
import BudgetNavigatorAbi from '@/config/abi/BudgetNavigator.json'
import DAOShipAndVaultLauncherAbi from '@/config/abi/DAOShipAndVaultLauncher.json'
import DAOShipLauncherAbi from '@/config/abi/DAOShipLauncher.json'
import ERC20TributeNavigatorAbi from '@/config/abi/ERC20TributeNavigator.json'
import LootERC20Abi from '@/config/abi/LootERC20.json'
import NFTGatedNavigatorAbi from '@/config/abi/NFTGatedNavigator.json'
import OnboarderNavigatorAbi from '@/config/abi/OnboarderNavigator.json'
import PosterAbi from '@/config/abi/Poster.json'
import QuaiVaultAbi from '@/config/abi/QuaiVault.json'
import QuaiVaultProxyAbi from '@/config/abi/QuaiVaultProxy.json'
import SharesERC20Abi from '@/config/abi/SharesERC20.json'
import SignalNavigatorAbi from '@/config/abi/SignalNavigator.json'
import SubscriptionNavigatorAbi from '@/config/abi/SubscriptionNavigator.json'
import TimelockNavigatorAbi from '@/config/abi/TimelockNavigator.json'
import VestingNavigatorAbi from '@/config/abi/VestingNavigator.json'

/**
 * Map of DAOShip custom error names to user-friendly messages.
 */
const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  IncorrectOffering: 'The proposal tribute amount does not match what this DAO requires. Check the required tribute in DAO settings.',
  SelfSponsorNoOffering: 'You have enough shares to auto-sponsor, but the required tribute was not sent. Set the tribute amount to match the DAO requirement.',
  NotAuthorized: 'You are not authorized to perform this action. You may need to be a DAO member.',
  AdminLocked: 'The DAO admin functions are locked.',
  GovernorLocked: 'The DAO governor functions are locked.',
  ManagerLocked: 'The DAO manager functions are locked.',
  AlreadyVoted: 'You have already voted on this proposal.',
  AlreadyCancelled: 'This proposal has already been cancelled.',
  AlreadyProcessed: 'This proposal has already been processed.',
  AlreadySponsored: 'This proposal has already been sponsored.',
  NotVoting: 'This proposal is not in the voting period.',
  NotReady: 'This proposal is not ready to be processed yet.',
  NotSubmitted: 'This proposal has not been submitted or does not exist.',
  NotCancellable: 'This proposal cannot be cancelled in its current state.',
  InsufficientShares: 'You do not have enough shares for this action.',
  InsufficientVotingPower: 'You do not have enough voting power to sponsor this proposal.',
  InvalidProposal: 'The proposal data is invalid.',
  Expired: 'This proposal has expired.',
  ExpirationTooSoon: 'The expiration time is too soon.',
  ReentrancyGuardReentrantCall: 'The DAO is currently processing another transaction. Please wait and try again.',
  ProposalLimitReached: 'The maximum number of proposals has been reached.',
  EmptyArrays: 'The proposal contains empty action arrays.',
  LengthMismatch: 'The proposal action arrays have mismatched lengths.',
  ZeroAmount: 'Cannot use a zero amount.',
  CanOnlyTargetSelf: 'Proposal actions can only target the DAO contract itself.',
  OfferingTransferFailed: 'The tribute transfer failed. Check your QUAI balance.',
  TokensNotSorted: 'Guild token addresses must be provided in ascending order. Please try again.',
  NotGuildToken: 'One or more tokens are no longer registered as guild tokens. The guild token list may have changed — please close and reopen the dialog.',
  InsufficientRetention: 'Ragequit would drop your shares below the DAO\'s minimum retention requirement. You may need to keep a minimum number of shares.',
  TokenTransferFailed: 'A token transfer failed during ragequit. The treasury may have insufficient balance for one of the requested tokens.',
}

/**
 * Recursively search an error object for revert data hex strings.
 * quais nests revert data inconsistently depending on the call path.
 */
function findRevertData(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== 'object' || depth > 5) return null

  const err = error as Record<string, unknown>

  // Check common locations where quais attaches revert data
  for (const key of ['data', 'revert', 'value', 'body']) {
    const val = err[key]
    if (typeof val === 'string' && val.startsWith('0x') && val.length >= 10) {
      return val
    }
  }

  // Check nested error objects
  for (const key of ['error', 'cause', 'info', 'payload']) {
    if (err[key] && typeof err[key] === 'object') {
      const found = findRevertData(err[key], depth + 1)
      if (found) return found
    }
  }

  return null
}

/**
 * Every ABI the app can provoke a revert from.
 *
 * Decoding used to run against DAOShip.json alone, so any revert originating in
 * a navigator, a token, the vault, or a launcher fell through undecoded and
 * surfaced as "missing revert data" — the single most common user complaint.
 * A proposal that reverts inside a navigator is not a DAOShip error.
 *
 * Note the shape inconsistency: QuaiVault.json and QuaiVaultProxy.json are
 * `{ abi: [...] }` objects while the other 14 are bare arrays, so they cannot be
 * handed to `new quais.Interface()` directly. normalizeAbi() absorbs that rather
 * than silently dropping the vault — which is exactly the contract whose reverts
 * are hardest to diagnose by hand.
 */
const ALL_ABIS: readonly unknown[] = [
  DAOShipAbi,
  BudgetNavigatorAbi,
  DAOShipAndVaultLauncherAbi,
  DAOShipLauncherAbi,
  ERC20TributeNavigatorAbi,
  LootERC20Abi,
  NFTGatedNavigatorAbi,
  OnboarderNavigatorAbi,
  PosterAbi,
  QuaiVaultAbi,
  QuaiVaultProxyAbi,
  SharesERC20Abi,
  SignalNavigatorAbi,
  SubscriptionNavigatorAbi,
  TimelockNavigatorAbi,
  VestingNavigatorAbi,
]

/** Accepts both artifact shapes: a bare fragment array or `{ abi: [...] }`. */
function normalizeAbi(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && Array.isArray((raw as { abi?: unknown }).abi)) {
    return (raw as { abi: unknown[] }).abi
  }
  return null
}

/**
 * Interfaces are built once and reused. Constructing 16 of them per decode
 * attempt would put ABI parsing on the error path of every failed estimate.
 */
let cachedInterfaces: quais.Interface[] | null = null

function getInterfaces(): quais.Interface[] {
  if (cachedInterfaces) return cachedInterfaces

  const built: quais.Interface[] = []
  for (const raw of ALL_ABIS) {
    const abi = normalizeAbi(raw)
    if (!abi) continue
    try {
      built.push(new quais.Interface(abi as never))
    } catch {
      // A malformed ABI must not take down error decoding for the other 15.
    }
  }

  cachedInterfaces = built
  return built
}

/**
 * Attempt to decode a custom error from the revert data against every known ABI.
 *
 * First match wins. Selector collisions across contracts are possible in
 * principle but the decoded name is still reported, which beats the previous
 * behaviour of reporting nothing at all.
 */
function tryDecodeCustomError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null

  const data = findRevertData(error)
  if (!data) return null

  for (const iface of getInterfaces()) {
    try {
      const decoded = iface.parseError(data)
      if (decoded) {
        return CUSTOM_ERROR_MESSAGES[decoded.name] ?? `Contract error: ${decoded.name}`
      }
    } catch {
      // This ABI does not know the selector — try the next.
    }
  }

  return null
}

/**
 * An Error enriched with the parsed transaction-error fields, attached by
 * estimateGasOrThrow so callers can surface a structured message.
 */
interface EnhancedError extends Error {
  title?: string
  suggestion?: string
  code?: string
  originalError?: unknown
}

/**
 * Estimate gas for a contract method call, throwing a descriptive error if the
 * call would revert.
 *
 * This should be called before sending a transaction to the wallet so that
 * reverts are caught with a clear message instead of a confusing wallet popup.
 *
 * When the wallet RPC bridge doesn't return revert data (e.g. Pelagus wraps
 * all failures as code 4001 "user rejected"), this function returns normally
 * instead of throwing — the wallet will do its own simulation at signing time
 * and show the real error if the transaction would actually fail.
 *
 * @param contract      - A quais Contract instance with an estimateGas namespace
 * @param method        - The contract method name (e.g. 'submitProposal')
 * @param args          - Arguments to pass to the method
 * @param operationName - Human-readable name of the operation for error messages
 *                        (e.g. 'Submit Proposal', 'Vote on Proposal')
 * @param overrides     - Optional transaction overrides (value, gasLimit, etc.)
 * @returns The estimated gas as a bigint, or undefined if estimation was skipped
 * @throws Error with a user-friendly message if a specific contract error was decoded
 */
export async function estimateGasOrThrow(
  contract: quais.Contract,
  method: string,
  args: unknown[],
  operationName: string,
  overrides?: Record<string, unknown>,
): Promise<bigint | undefined> {
  try {
    // quais contracts expose estimateGas as a namespace: contract[method].estimateGas(...)
    // The method namespace is dynamic, so narrow via a contained cast rather than `any`.
    const methods = contract as unknown as Record<string, { estimateGas?: (...a: unknown[]) => Promise<bigint> }>
    const estimateFn = methods[method]?.estimateGas
    if (typeof estimateFn !== 'function') {
      // Can't estimate, let the transaction attempt proceed
      console.warn(`[GasEstimator] Method "${method}" does not support gas estimation, skipping`)
      return undefined
    }

    const callArgs = overrides ? [...args, overrides] : args
    const gasEstimate: bigint = await estimateFn(...callArgs)

    return gasEstimate
  } catch (error: unknown) {
    // Try to decode a specific contract error from revert data
    const customMessage = tryDecodeCustomError(error)
    if (customMessage) {
      console.error(`[GasEstimator] ${operationName} failed with contract error:`, customMessage)
      throw new Error(`${operationName} failed: ${customMessage}`)
    }

    // No revert data available — this often happens when the wallet's RPC bridge
    // doesn't forward revert data (e.g. Pelagus returns code 4001 for all
    // estimateGas failures). In this case, skip the pre-check and let the
    // wallet handle simulation at signing time. If the transaction would truly
    // revert, the wallet will block it with its own error.
    const revertHex = findRevertData(error)
    if (!revertHex) {
      console.warn(
        `[GasEstimator] ${operationName} estimation failed without revert data — ` +
        `skipping pre-check, wallet will simulate at signing time.`,
        error,
      )
      return undefined
    }

    // We have revert data but couldn't decode it as a known custom error.
    // This is a genuine contract revert with an unknown error signature.
    console.error(`[GasEstimator] ${operationName} reverted with unknown error:`, revertHex)
    const parsed = parseTransactionError(error)
    const parts = [`${operationName} failed: ${parsed.message}`]
    if (parsed.suggestion) {
      parts.push(parsed.suggestion)
    }

    const enhancedError = new Error(parts.join('\n\n')) as EnhancedError
    enhancedError.title = parsed.title
    enhancedError.suggestion = parsed.suggestion
    enhancedError.code = parsed.code
    enhancedError.originalError = error

    throw enhancedError
  }
}

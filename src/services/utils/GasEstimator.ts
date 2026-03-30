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

  const err = error as Record<string, any>

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
 * Attempt to decode a custom error from the revert data using the DAOShip ABI.
 */
function tryDecodeCustomError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null

  const data = findRevertData(error)
  if (!data) return null

  try {
    const iface = new quais.Interface(DAOShipAbi)
    const decoded = iface.parseError(data)
    if (decoded) {
      return CUSTOM_ERROR_MESSAGES[decoded.name] ?? `Contract error: ${decoded.name}`
    }
  } catch {
    // Not a decodable error
  }

  return null
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
  contract: any,
  method: string,
  args: any[],
  operationName: string,
  overrides?: Record<string, any>,
): Promise<bigint | undefined> {
  try {
    // quais contracts expose estimateGas as a namespace: contract[method].estimateGas(...)
    const estimateFn = contract[method]?.estimateGas
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

    const enhancedError = new Error(parts.join('\n\n'))
    ;(enhancedError as any).title = parsed.title
    ;(enhancedError as any).suggestion = parsed.suggestion
    ;(enhancedError as any).code = parsed.code
    ;(enhancedError as any).originalError = error

    throw enhancedError
  }
}

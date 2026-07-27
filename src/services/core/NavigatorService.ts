import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import OnboarderNavigatorABI from '@/config/abi/OnboarderNavigator.json'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorService - Navigator contract interactions
// ═══════════════════════════════════════════════════════════════════════════

import { timelockNavService } from './navigators/TimelockNavService'
import { vestingNavService } from './navigators/VestingNavService'
import { budgetNavService } from './navigators/BudgetNavService'
import { signalNavService } from './navigators/SignalNavService'
import { onboarderNavService } from './navigators/OnboarderNavService'
import { nftGatedNavService } from './navigators/NFTGatedNavService'
import { erc20TributeNavService } from './navigators/ERC20TributeNavService'
import { subscriptionNavService } from './navigators/SubscriptionNavService'

// Config types live in a neutral module (avoids a circular dep with the future
// per-type sub-services); re-exported here so existing `@/services/core/NavigatorService`
// type imports keep working unchanged.
export type {
  NavigatorType,
  NavigatorConfigResult,
  OnboarderNavigatorConfig,
  ERC20TributeNavigatorConfig,
  NFTGatedNavigatorConfig,
  SignalNavigatorConfig,
  BudgetNavigatorConfig,
  BudgetRemaining,
  VestingNavigatorConfig,
  TimelockNavigatorConfig,
  SubscriptionTokenOption,
  SubscriptionNavigatorConfig,
} from './navigators/types'
import type {
  NavigatorConfigResult,
  OnboarderNavigatorConfig,
  ERC20TributeNavigatorConfig,
  NFTGatedNavigatorConfig,
  SignalNavigatorConfig,
  BudgetNavigatorConfig,
  BudgetRemaining,
  VestingNavigatorConfig,
  TimelockNavigatorConfig,
  SubscriptionNavigatorConfig,
} from './navigators/types'

/**
 * Service for interacting with navigator contracts.
 *
 * Shipped navigators:
 * - OnboarderNavigator (MANAGER=2): Native QUAI tribute → shares/loot
 * - ERC20TributeNavigator (MANAGER=2): ERC20 token tribute → shares/loot
 * - NFTGatedNavigator (MANAGER=2): ERC-721 ownership → shares/loot (one claim per tokenId)
 */
class NavigatorService {

  // ═══════════════════════════════════════════════════════════════════════
  // Type Detection (canonical: reads navigatorType() constant)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Detect navigator type by reading the on-chain `navigatorType()` constant,
   * then load the type-specific config.
   */
  async detectAndLoadConfig(navigatorAddress: string): Promise<NavigatorConfigResult> {
    try {
      // Both navigator ABIs expose navigatorType() — use OnboarderNavigator ABI as a generic reader
      const contract = new quais.Contract(
        navigatorAddress,
        OnboarderNavigatorABI,
        baseService.getProvider(),
      )
      const typeString: string = await contract.navigatorType()

      switch (typeString) {
        case 'OnboarderNavigator': {
          const config = await this.getOnboarderConfig(navigatorAddress)
          return { type: 'OnboarderNavigator', config }
        }
        case 'ERC20TributeNavigator': {
          const config = await this.getERC20TributeConfig(navigatorAddress)
          return { type: 'ERC20TributeNavigator', config }
        }
        case 'NFTGatedNavigator': {
          const config = await this.getNFTGatedConfig(navigatorAddress)
          return { type: 'NFTGatedNavigator', config }
        }
        case 'SignalNavigator': {
          const config = await this.getSignalConfig(navigatorAddress)
          return { type: 'SignalNavigator', config }
        }
        case 'BudgetNavigator': {
          const config = await this.getBudgetConfig(navigatorAddress)
          return { type: 'BudgetNavigator', config }
        }
        case 'VestingNavigator': {
          const config = await this.getVestingConfig(navigatorAddress)
          return { type: 'VestingNavigator', config }
        }
        case 'TimelockNavigator': {
          const config = await this.getTimelockConfig(navigatorAddress)
          return { type: 'TimelockNavigator', config }
        }
        case 'SubscriptionNavigator': {
          const config = await this.getSubscriptionConfig(navigatorAddress)
          return { type: 'SubscriptionNavigator', config }
        }
        default:
          // A genuinely unrecognised navigator type — this IS a legitimate result.
          return { type: 'unknown', config: null }
      }
    } catch (err) {
      // A read failure is NOT 'unknown'. Returning a resolved value here made React
      // Query cache it as a success for the full 5-minute staleTime, and
      // NavigatorDetail's `configResult?.type || navigator.navigator_type` then shadowed
      // the correct indexer type — rendering UnknownPlugin ("not yet supported") above a
      // Type field that read BudgetNavigator. The dominant trigger is simply a
      // disconnected wallet.
      throw err instanceof Error
        ? err
        : new Error(`Failed to load navigator config for ${navigatorAddress}`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OnboarderNavigator
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read the full OnboarderNavigator configuration.
   */
  getOnboarderConfig(navigatorAddress: string): Promise<OnboarderNavigatorConfig> {
    return onboarderNavService.getOnboarderConfig(navigatorAddress)
  }

  /**
   * Get amount minted to a specific address (for perAddressCap display).
   */
  getOnboarderMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    return onboarderNavService.getOnboarderMintedTo(navigatorAddress, userAddress)
  }

  /**
   * Onboard via OnboarderNavigator. Payable — sends native QUAI.
   * @param proof Merkle proof (empty array if no allowlist)
   */
  onboarderOnboard(navigatorAddress: string, value: bigint, proof: string[] = []): Promise<void> {
    return onboarderNavService.onboarderOnboard(navigatorAddress, value, proof)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ERC20TributeNavigator
  // ═══════════════════════════════════════════════════════════════════════


  /**
   * Read the full ERC20TributeNavigator configuration.
   * Also reads the tribute token's symbol and decimals.
   */
  getERC20TributeConfig(navigatorAddress: string): Promise<ERC20TributeNavigatorConfig> {
    return erc20TributeNavService.getERC20TributeConfig(navigatorAddress)
  }

  /** Get amount minted to a specific address. */
  getERC20TributeMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    return erc20TributeNavService.getERC20TributeMintedTo(navigatorAddress, userAddress)
  }

  /**
   * Onboard via ERC20TributeNavigator. Tries the gasless ERC-2612 permit path first,
   * then falls back to USDT-safe approve → onboard.
   */
  erc20TributeOnboard(
    navigatorAddress: string,
    sharesToMint: bigint,
    lootToMint: bigint,
    proof: string[] = [],
  ): Promise<void> {
    return erc20TributeNavService.erc20TributeOnboard(navigatorAddress, sharesToMint, lootToMint, proof)
  }

  /**
   * Calculate the tribute cost for an ERC20 tribute onboard. Returns -1n when the
   * requested mint would truncate the cost to zero (a guaranteed on-chain revert).
   */
  calculateERC20TributeCost(
    sharesToMint: bigint,
    lootToMint: bigint,
    pricePerShare: bigint,
    pricePerLoot: bigint,
  ): bigint {
    return erc20TributeNavService.calculateERC20TributeCost(sharesToMint, lootToMint, pricePerShare, pricePerLoot)
  }
  // ═══════════════════════════════════════════════════════════════════════
  // NFTGatedNavigator
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read the full NFTGatedNavigator configuration from immutable on-chain views.
   * Does NOT read the gate collection itself (untrusted external contract) — the
   * plugin probes the gate (name/symbol/ownership) defensively with try/catch.
   */
  getNFTGatedConfig(navigatorAddress: string): Promise<NFTGatedNavigatorConfig> {
    return nftGatedNavService.getNFTGatedConfig(navigatorAddress)
  }

  /**
   * Read `tokenURI(tokenId)` from a gate ERC-721 collection (untrusted external contract — every
   * call is wrapped in try/catch). Used to render claimed-token images in the gallery. Returns
   * null when there's no provider, the call reverts, or the URI is empty.
   */
  getErc721TokenURI(collection: string, tokenId: string): Promise<string | null> {
    return nftGatedNavService.getErc721TokenURI(collection, tokenId)
  }

  /**
   * Amount (shares+loot) minted to an address — for perAddressCap display.
   */
  getNFTGatedMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    return nftGatedNavService.getNFTGatedMintedTo(navigatorAddress, userAddress)
  }

  /**
   * Has this specific tokenId already been claimed? (Per-token, permanent.)
   * Authoritative — read this at submit time, never trust the indexer for the
   * member's own pending claim.
   */
  nftGatedClaimed(navigatorAddress: string, tokenId: bigint): Promise<boolean> {
    return nftGatedNavService.nftGatedClaimed(navigatorAddress, tokenId)
  }

  /**
   * Preflight: does NOT cover tribute or caps (by contract design). Returns false
   * if paused, expired, already claimed, or the candidate doesn't currently own the
   * token. Never reverts.
   */
  nftGatedCanOnboard(
    navigatorAddress: string,
    candidate: string,
    tokenId: bigint,
  ): Promise<boolean> {
    return nftGatedNavService.nftGatedCanOnboard(navigatorAddress, candidate, tokenId)
  }

  /**
   * Onboard by claiming an owned gate NFT. Payable — sends the exact native
   * tribute (0n in free-mint mode).
   *
   * Overload selection follows the on-chain allowlist (audit M-04):
   * - `proof === null`  → no allowlist → `onboard(uint256)`
   * - `proof` provided  → allowlist active → `onboard(uint256,bytes32[])`
   *
   * @param tributeValue Exact native tribute in wei (pass the on-chain `tributeAmount`
   *                     verbatim; 0n when `requireTribute` is false).
   */
  nftGatedOnboard(
    navigatorAddress: string,
    tokenId: bigint,
    tributeValue: bigint,
    proof: string[] | null = null,
  ): Promise<void> {
    return nftGatedNavService.nftGatedOnboard(navigatorAddress, tokenId, tributeValue, proof)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SignalNavigator (read-only, non-binding polls)
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the SignalNavigator's immutable config + current poll count. */
  getSignalConfig(navigatorAddress: string): Promise<SignalNavigatorConfig> {
    return signalNavService.getSignalConfig(navigatorAddress)
  }

  /** Has `voter` already voted on a poll? (Authoritative on-chain read.) */
  signalHasVoted(navigatorAddress: string, pollId: bigint, voter: string): Promise<boolean> {
    return signalNavService.signalHasVoted(navigatorAddress, pollId, voter)
  }

  /** Poll status enum: 0=Pending, 1=Active, 2=Ended, 3=Cancelled. */
  signalPollStatus(navigatorAddress: string, pollId: bigint): Promise<number> {
    return signalNavService.signalPollStatus(navigatorAddress, pollId)
  }

  /**
   * Create a poll. `startTime` is an absolute unix timestamp (0 = open now; else
   * now..now+maxStartDelay). `duration` is in seconds, within [minDuration, maxDuration].
   * `optionCount` must be 2..10.
   */
  signalCreatePoll(
    navigatorAddress: string,
    question: string,
    optionCount: number,
    startTime: bigint,
    duration: bigint,
  ): Promise<bigint> {
    return signalNavService.signalCreatePoll(navigatorAddress, question, optionCount, startTime, duration)
  }

  /** Cast a vote. Weight is the snapshot share power (loot excluded), resolved on-chain. */
  signalVote(navigatorAddress: string, pollId: bigint, option: number): Promise<void> {
    return signalNavService.signalVote(navigatorAddress, pollId, option)
  }

  /** Cancel a poll (creator before start; avatar before end). */
  signalCancelPoll(navigatorAddress: string, pollId: bigint): Promise<void> {
    return signalNavService.signalCancelPoll(navigatorAddress, pollId)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BudgetNavigator (MODULE class — treasury disbursement, no DAOShip permission)
  // ───────────────────────────────────────────────────────────────────────
  // Authority is being an enabled Zodiac module on the DAO's vault. Budgets and
  // their static config come from the indexer (ds_budgets); on-chain we only read
  // the LIVE figures (remaining* reset lazily) + paused, and submit manager/admin txs.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the BudgetNavigator's immutable config + current budget count + pause flag. */
  getBudgetConfig(navigatorAddress: string): Promise<BudgetNavigatorConfig> {
    return budgetNavService.getBudgetConfig(navigatorAddress)
  }

  /**
   * Live remaining figures for one budget — both reset/accrue lazily on-chain, so
   * read them fresh before a disburse to disable a too-large amount before it reverts.
   */
  getBudgetRemaining(navigatorAddress: string, budgetId: bigint): Promise<BudgetRemaining> {
    return budgetNavService.getBudgetRemaining(navigatorAddress, budgetId)
  }

  /** Authoritative pause flag (freezes ALL disbursement). */
  getBudgetPaused(navigatorAddress: string): Promise<boolean> {
    return budgetNavService.getBudgetPaused(navigatorAddress)
  }

  /**
   * Is this navigator currently an enabled module on the given vault? The
   * unforgeable source of truth behind trust_status — confirm before disbursing.
   */
  isModuleEnabled(vaultAddress: string, navigatorAddress: string): Promise<boolean> {
    return budgetNavService.isModuleEnabled(vaultAddress, navigatorAddress)
  }

  /** Disburse a single payout from a budget. Manager-only (reverts otherwise). */
  budgetDisburse(
    navigatorAddress: string,
    budgetId: bigint,
    to: string,
    amount: bigint,
  ): Promise<void> {
    return budgetNavService.budgetDisburse(navigatorAddress, budgetId, to, amount)
  }

  /** Batch payroll disbursement (atomic). Manager-only; `to` and `amounts` must align. */
  budgetDisburseBatch(
    navigatorAddress: string,
    budgetId: bigint,
    to: string[],
    amounts: bigint[],
  ): Promise<void> {
    return budgetNavService.budgetDisburseBatch(navigatorAddress, budgetId, to, amounts)
  }

  /** Freeze ALL disbursement (the fast brake). GOVERNOR navigator or avatar only. */
  budgetPause(navigatorAddress: string): Promise<void> {
    return budgetNavService.budgetPause(navigatorAddress)
  }

  /** Resume disbursement. GOVERNOR navigator or avatar only. */
  budgetUnpause(navigatorAddress: string): Promise<void> {
    return budgetNavService.budgetUnpause(navigatorAddress)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VestingNavigator (MANAGER — mints shares/loot on a cliff + linear schedule)
  // ───────────────────────────────────────────────────────────────────────
  // Schedules + their static config come from the indexer (ds_vesting_schedules);
  // schedules are created/revoked by governance (avatar-only → proposals). On-chain
  // we read the LIVE claimable (authoritative preflight) and submit the beneficiary
  // claim directly. No escrow — claim() mints vested-but-unclaimed TO THE BENEFICIARY.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the VestingNavigator's config: schedule count, pause flag, DAO binding. */
  getVestingConfig(navigatorAddress: string): Promise<VestingNavigatorConfig> {
    return vestingNavService.getVestingConfig(navigatorAddress)
  }

  /**
   * Live claimable for one schedule — the authoritative preflight (read fresh before
   * claiming to disable the button when nothing has vested). Mirrors the indexer's
   * derived `claimable`, but on-chain and lag-free.
   */
  getVestingClaimable(navigatorAddress: string, scheduleId: bigint): Promise<bigint> {
    return vestingNavService.getVestingClaimable(navigatorAddress, scheduleId)
  }

  /** Live total-vested for one schedule (minted + still-claimable). */
  getVestingVested(navigatorAddress: string, scheduleId: bigint): Promise<bigint> {
    return vestingNavService.getVestingVested(navigatorAddress, scheduleId)
  }

  /** The schedule IDs for a beneficiary (on-chain view). */
  getVestingSchedules(navigatorAddress: string, beneficiary: string): Promise<bigint[]> {
    return vestingNavService.getVestingSchedules(navigatorAddress, beneficiary)
  }

  /**
   * Claim vested-but-unclaimed tokens for a schedule. Callable by the beneficiary OR
   * the avatar; ALWAYS mints to the schedule's beneficiary (never the caller).
   */
  vestingClaim(navigatorAddress: string, scheduleId: bigint): Promise<void> {
    return vestingNavService.vestingClaim(navigatorAddress, scheduleId)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TimelockNavigator (GOVERNOR — delays governance-config changes)
  // ───────────────────────────────────────────────────────────────────────
  // Queued changes + their full config bytes come from the indexer (ds_timelock_changes).
  // queue/cancel/emergencyCancelAll/pause are avatar-only → governance proposals (deep-links).
  // executeChange is PERMISSIONLESS once matured — anyone can crank it directly.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the TimelockNavigator's config: change count, pause flag, delay, expiry window. */
  getTimelockConfig(navigatorAddress: string): Promise<TimelockNavigatorConfig> {
    return timelockNavService.getTimelockConfig(navigatorAddress)
  }

  /** Is this change executable right now? (Authoritative on-chain preflight.) */
  timelockIsExecutable(navigatorAddress: string, changeId: bigint): Promise<boolean> {
    return timelockNavService.timelockIsExecutable(navigatorAddress, changeId)
  }

  /**
   * Execute a matured queued change — PERMISSIONLESS (anyone can crank). You MUST pass
   * the exact `governanceConfig` bytes from the indexed row; the hash won't reconstruct
   * them (wrong bytes → ConfigHashMismatch).
   */
  timelockExecuteChange(
    navigatorAddress: string,
    changeId: bigint,
    governanceConfig: string,
  ): Promise<void> {
    return timelockNavService.timelockExecuteChange(navigatorAddress, changeId, governanceConfig)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SubscriptionNavigator (MANAGER — recurring membership dues)
  // ───────────────────────────────────────────────────────────────────────
  // Immutable config (token menu, fees, period, grace, reward, enforcement) is read once.
  // Members pull-pay via payFee/payFeeFor (exact native value, or ERC-20 approve); anyone
  // may collectFee a delinquent member. enroll/pause/withdraw are avatar-only → proposals.
  // ═══════════════════════════════════════════════════════════════════════


  /** Read the full (immutable) SubscriptionNavigator config + the accepted-token fee menu. */
  getSubscriptionConfig(navigatorAddress: string): Promise<SubscriptionNavigatorConfig> {
    return subscriptionNavService.getSubscriptionConfig(navigatorAddress)
  }

  /** Total cost for `periods` periods in `token` (reverts TokenNotAccepted on a bad token). */
  subscriptionQuote(navigatorAddress: string, periods: bigint, token: string): Promise<bigint> {
    return subscriptionNavService.subscriptionQuote(navigatorAddress, periods, token)
  }

  /** A member's absolute paid-through timestamp (unix seconds; 0 = not enrolled). */
  subscriptionPaidThrough(navigatorAddress: string, member: string): Promise<bigint> {
    return subscriptionNavService.subscriptionPaidThrough(navigatorAddress, member)
  }

  /** Authoritative collectible check (matches the keeper-collection precondition). */
  subscriptionIsDelinquent(navigatorAddress: string, member: string): Promise<boolean> {
    return subscriptionNavService.subscriptionIsDelinquent(navigatorAddress, member)
  }

  /** Pay your own dues (native exact-value, or ERC-20 approve → pay). */
  subscriptionPayFee(navigatorAddress: string, periods: bigint, token: string): Promise<void> {
    return subscriptionNavService.subscriptionPayFee(navigatorAddress, periods, token)
  }

  /** Sponsor another member's dues. */
  subscriptionPayFeeFor(
    navigatorAddress: string,
    member: string,
    periods: bigint,
    token: string,
  ): Promise<void> {
    return subscriptionNavService.subscriptionPayFeeFor(navigatorAddress, member, periods, token)
  }

  /** Collect a delinquent member — PERMISSIONLESS keeper crank. */
  subscriptionCollectFee(navigatorAddress: string, member: string): Promise<void> {
    return subscriptionNavService.subscriptionCollectFee(navigatorAddress, member)
  }
}

export const navigatorService = new NavigatorService()

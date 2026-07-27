// ═══════════════════════════════════════════════════════════════════════════
// Navigator config types — shared across the per-type navigator sub-services
// ───────────────────────────────────────────────────────────────────────────
// These live in a neutral module so both the sub-services and the NavigatorService
// facade (which re-exports them for backward-compatible imports) can depend on them
// without a circular dependency.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Type discriminator ──────────────────────────────────────────────────

export type NavigatorType =
  | 'OnboarderNavigator'
  | 'ERC20TributeNavigator'
  | 'NFTGatedNavigator'
  | 'SignalNavigator'
  | 'BudgetNavigator'
  | 'VestingNavigator'
  | 'TimelockNavigator'
  | 'SubscriptionNavigator'
  | 'unknown'

export type NavigatorConfigResult =
  | { type: 'OnboarderNavigator'; config: OnboarderNavigatorConfig }
  | { type: 'ERC20TributeNavigator'; config: ERC20TributeNavigatorConfig }
  | { type: 'NFTGatedNavigator'; config: NFTGatedNavigatorConfig }
  | { type: 'SignalNavigator'; config: SignalNavigatorConfig }
  | { type: 'BudgetNavigator'; config: BudgetNavigatorConfig }
  | { type: 'VestingNavigator'; config: VestingNavigatorConfig }
  | { type: 'TimelockNavigator'; config: TimelockNavigatorConfig }
  | { type: 'SubscriptionNavigator'; config: SubscriptionNavigatorConfig }
  | { type: 'unknown'; config: null }

// ─── OnboarderNavigator config ───────────────────────────────────────────

export interface OnboarderNavigatorConfig {
  mode: 'multiplier' | 'fixedPrice'
  // Multiplier mode (basis points: 10000 = 1x)
  shareMultiplier: bigint
  lootMultiplier: bigint
  // Fixed-price mode
  pricePerUnit: bigint
  sharesPerUnit: bigint
  lootPerUnit: bigint
  // Common
  minTribute: bigint
  expiry: bigint
  mintCap: bigint
  perAddressCap: bigint
  allowlistRoot: string
  totalMinted: bigint
  paused: boolean
  navigatorType: string
}

// ─── ERC20TributeNavigator config ────────────────────────────────────────

export interface ERC20TributeNavigatorConfig {
  tributeToken: string
  tributeTokenSymbol: string
  tributeTokenDecimals: number
  pricePerShare: bigint
  pricePerLoot: bigint
  expiry: bigint
  mintCap: bigint
  perAddressCap: bigint
  allowlistRoot: string
  totalMinted: bigint
  paused: boolean
  navigatorType: string
}

// ─── NFTGatedNavigator config ────────────────────────────────────────────

export interface NFTGatedNavigatorConfig {
  /** The gated ERC-721 collection address (untrusted external contract). */
  gateToken: string
  /** Shares minted per claim (raw wei; 1e18 = 1 whole share). */
  sharesPerHolder: bigint
  /** Loot minted per claim (raw wei). */
  lootPerHolder: bigint
  /** When true, the exact `tributeAmount` (wei) must be sent with onboard. */
  requireTribute: boolean
  /** Exact native tribute required per claim, in wei (0 in free-mint mode). */
  tributeAmount: bigint
  expiry: bigint
  mintCap: bigint
  perAddressCap: bigint
  allowlistRoot: string
  totalMinted: bigint
  paused: boolean
  navigatorType: string
}

// ─── SignalNavigator config ──────────────────────────────────────────────

export interface SignalNavigatorConfig {
  /** Minimum voting power (wei) required to open a poll; 0 = anyone with any power. */
  minSharesToCreatePoll: bigint
  /** Poll duration bounds, in seconds. */
  minDuration: bigint
  maxDuration: bigint
  /** Max scheduling lead time, in seconds; 0 = immediate-only (no scheduling). */
  maxStartDelay: bigint
  /** Number of polls created so far (next pollId === pollCount). */
  pollCount: bigint
  navigatorType: string
}

// ─── BudgetNavigator config ──────────────────────────────────────────────

export interface BudgetNavigatorConfig {
  /** Number of budgets created so far (next budgetId === budgetCount). */
  budgetCount: bigint
  /** When true, ALL disbursement is frozen (treasury brake), not just creation. */
  paused: boolean
  /** Min/max period length bounds, in seconds. */
  minPeriod: bigint
  maxPeriod: bigint
  /** The DAO this navigator self-asserts a binding to. */
  daoShip: string
  navigatorType: string
}

/** Live, on-chain "remaining" figures for one budget (the per-period allowance resets lazily). */
export interface BudgetRemaining {
  /** Remaining allowance in the current period (resets each period_length). */
  thisPeriod: bigint
  /** Remaining lifetime ceiling headroom. */
  total: bigint
}

// ─── VestingNavigator config ─────────────────────────────────────────────

export interface VestingNavigatorConfig {
  /** Number of schedules created so far (next scheduleId === scheduleCount). */
  scheduleCount: bigint
  /** When true, NEW schedules are blocked; existing claims/revokes still work. */
  paused: boolean
  /** The DAO this navigator self-asserts a binding to. */
  daoShip: string
  navigatorType: string
}

// ─── TimelockNavigator config ────────────────────────────────────────────

export interface TimelockNavigatorConfig {
  /** Number of changes queued so far (next changeId === changeCount). */
  changeCount: bigint
  /** When true, NEW queues are blocked; execution of already-queued changes still works. */
  paused: boolean
  /** Mandatory delay before a queued change becomes executable, in seconds. */
  delay: bigint
  /** How long a matured change stays executable, in seconds. */
  expiryWindow: bigint
  /** The DAO this navigator self-asserts a binding to. */
  daoShip: string
  navigatorType: string
}

// ─── SubscriptionNavigator config ────────────────────────────────────────

/** One entry in the accepted-token fee menu. */
export interface SubscriptionTokenOption {
  /** Token address; ZeroAddress = native QUAI. */
  address: string
  isNative: boolean
  /** Fee per period in this token's smallest unit. */
  feePerPeriod: bigint
  /** Resolved ERC-20 metadata (native uses QUAI/18). */
  symbol: string
  decimals: number
}

export interface SubscriptionNavigatorConfig {
  periodDuration: bigint // seconds
  graceDuration: bigint // seconds
  startTime: bigint // unix seconds
  collectorRewardBps: bigint // keeper reward, basis points
  burnOnCollect: boolean // true = burn shares, false = convert to loot
  paused: boolean
  tokens: SubscriptionTokenOption[]
  daoShip: string
  navigatorType: string
}

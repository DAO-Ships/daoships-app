// ═══════════════════════════════════════════════════════════════════════════
// BudgetNavigator types — ds_budgets / ds_budget_disbursements / ds_vault_module_events
// ───────────────────────────────────────────────────────────────────────────
// BudgetNavigator is the MODULE trust class: it holds NO DAOShip permission. Its
// authority is being an enabled Zodiac module on the DAO's vault. The indexer
// derives ds_navigators.trust_status / is_active from the vault's
// EnabledModule/DisabledModule feed (ds_vault_module_events) — only surface a
// budget navigator (and its budgets) once trust_status === 'sanctioned' && is_active.
//
// All large integers are NUMERIC(78,0) → JSON strings; wrap in BigInt() for math.
// Period/remaining figures are TIME-DERIVED on-chain (the per-period allowance
// resets lazily) — use the contract views remainingThisPeriod()/remainingTotal()
// for live numbers; total_spent here is the lifetime cumulative (SUM of
// disbursements), NOT the per-period figure.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A recurring treasury budget as stored in ds_budgets (one per createBudget).
 * `budget_id` is per-navigator (starts at 0). Money figures are wei strings.
 */
export interface BudgetRow {
  /** Composite key: `${navigator_address}-${budget_id}` */
  id: string
  dao_id: string
  navigator_address: string
  /** Per-navigator, starts at 0 (NUMERIC as string). */
  budget_id: string
  /** EOA/keeper authorized to disburse from this budget. */
  manager: string
  /** Token disbursed; `0x0000...0000` = native QUAI. */
  token: string
  /** Per-period spending limit (wei string). */
  allowance_per_period: string
  /** Lifetime ceiling across all periods (wei string). */
  total_ceiling: string
  /** Lifetime cumulative spend — derive-from-truth SUM of disbursements (wei string). */
  total_spent: string
  /** Period length in seconds. */
  period_length: number
  /** Absolute unix seconds the budget becomes active. */
  starts_at: number
  /** Absolute unix seconds the budget ends; 0 = perpetual. */
  ends_at: number
  cancelled: boolean
  block_number: number | null
  tx_hash: string | null
  created_at: string
  updated_at?: string
}

/**
 * A single payout as stored in ds_budget_disbursements (append-only feed).
 * One row per recipient — disburse() emits one, disburseBatch() emits N.
 */
export interface BudgetDisbursementRow {
  /** Composite key: `${navigator_address}-${budget_id}-${tx_hash}-${log_index}` */
  id: string
  /** FK → ds_budgets.id */
  budget_pk: string
  dao_id: string
  navigator_address: string
  budget_id: string
  recipient: string
  token: string
  /** Wei string. */
  amount: string
  block_number: number | null
  tx_hash: string | null
  created_at: string
}

/**
 * A vault EnabledModule/DisabledModule event as stored in ds_vault_module_events.
 * This is the authenticated trust feed: the navigator's trust_status/is_active is
 * derived from the latest surviving row. Render it as a "treasury access granted /
 * revoked" audit trail — this is how you know whether the module is still enabled.
 */
export interface VaultModuleEventRow {
  /** Composite key: `${tx_hash}-${log_index}` */
  id: string
  dao_id: string
  /** The vault (avatar) that emitted the event. */
  vault: string
  navigator_address: string
  /** true = EnabledModule, false = DisabledModule. */
  enabled: boolean
  tx_hash: string | null
  log_index: number
  block_number: number | null
  created_at: string
}

/** Time-derived budget status — never stored. See computeBudgetStatus(). */
export type BudgetStatus = 'pending' | 'active' | 'ended' | 'cancelled'

/**
 * Mirror of the contract's active window. Cancelled is terminal and overrides.
 * A budget is active while `now >= starts_at && (ends_at === 0 || now < ends_at)`.
 */
export function computeBudgetStatus(
  b: Pick<BudgetRow, 'cancelled' | 'starts_at' | 'ends_at'>,
  nowSec = Math.floor(Date.now() / 1000),
): BudgetStatus {
  if (b.cancelled) return 'cancelled'
  if (nowSec < b.starts_at) return 'pending'
  if (b.ends_at !== 0 && nowSec >= b.ends_at) return 'ended'
  return 'active'
}

/**
 * Lifetime ceiling remaining, clamped at 0. This is the cumulative headroom; for
 * the live per-period figure use the on-chain remainingThisPeriod() view.
 */
export function ceilingRemaining(
  b: Pick<BudgetRow, 'total_ceiling' | 'total_spent'>,
): bigint {
  const remaining = BigInt(b.total_ceiling) - BigInt(b.total_spent)
  return remaining > 0n ? remaining : 0n
}

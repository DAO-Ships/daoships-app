// ═══════════════════════════════════════════════════════════════════════════
// SubscriptionNavigator types — ds_subscription_members / _payments / _collections
// ───────────────────────────────────────────────────────────────────────────
// Recurring membership DUES. Members pull-pay periodic fees (a governance-set menu of
// native QUAI / ERC-20) to the vault to stay `current`. Past a grace window a member is
// `delinquent` and ANYONE may collectFee(member) to remove their shares — converted to
// loot (default) or burned — earning a small loot keeper reward.
//
// Permissioned MANAGER (2) — registered via setNavigators, so it always indexes as
// trust_status='sanctioned'. Config is immutable (read once from the contract).
//
// status is TIME-DERIVED (no event marks a deadline passing) — compute it from
// paid_through + the immutable graceDuration. NUMERIC(78,0) fields are JSON strings.
// `total_paid` is the indexer's derive-from-truth SUM of payments — never authoritative
// voting weight (that's the member's actual share balance).
// ═══════════════════════════════════════════════════════════════════════════

/** One row per (navigator, member) — ds_subscription_members. */
export interface SubscriptionMemberRow {
  /** Composite key: `${navigator_address}-${member}` */
  id: string
  dao_id: string
  navigator_address: string
  member: string
  /** Absolute unix seconds paid through; 0 = not enrolled / collected. */
  paid_through: number
  /** DERIVED: SUM(ds_subscription_payments.amount) — lifetime dues paid (wei string). */
  total_paid: string
  /** ISO timestamp of the last collection; null until first collected. */
  last_collected_at: string | null
  tx_hash: string
  created_at: string
  updated_at: string
}

/** Append-only payment feed (FeePaid events) — ds_subscription_payments. */
export interface SubscriptionPaymentRow {
  /** Composite key: `${navigator_address}-${member}-${tx_hash}-${log_index}` */
  id: string
  /** FK → ds_subscription_members.id */
  member_pk: string
  dao_id: string
  navigator_address: string
  /** The member whose dues were paid (the beneficiary). */
  member: string
  /** Who funded it — differs from `member` on payFeeFor (sponsorship). */
  payer: string
  /** Token paid in; `0x0000…0000` = native QUAI. */
  token: string
  /** Per-payment amount (NOT cumulative) — wei string. */
  amount: string
  /** Periods purchased — NUMERIC string. */
  periods: string
  /** Absolute unix seconds the member is paid through after this payment. */
  paid_through: number
  tx_hash: string
  block_number: number
  created_at: string
}

/** Append-only keeper-collection feed (FeeCollected events) — ds_subscription_collections. */
export interface SubscriptionCollectionRow {
  /** Composite key: `${navigator_address}-${member}-${tx_hash}-${log_index}` */
  id: string
  /** FK → ds_subscription_members.id */
  member_pk: string
  dao_id: string
  navigator_address: string
  /** The delinquent member who was collected. */
  member: string
  /** The keeper who called collectFee. */
  collector: string
  /** Shares removed from the member — wei string. */
  shares_removed: string
  /** Loot minted to the collector as reward — wei string. */
  reward: string
  /** true = shares burned; false = shares converted to loot. */
  burned: boolean
  tx_hash: string
  block_number: number
  created_at: string
}

/** Time-derived subscription status — never stored. See computeSubscriptionStatus(). */
export type SubscriptionStatus = 'not_enrolled' | 'current' | 'grace' | 'delinquent'

/**
 * Mirror of the contract's status logic (isCurrent / inGracePeriod / isDelinquent).
 * pt = paid_through; grace = graceDuration. Half-open windows match the contract:
 * current while now <= pt, grace while pt < now <= pt+grace, else delinquent.
 */
export function computeSubscriptionStatus(
  m: Pick<SubscriptionMemberRow, 'paid_through'>,
  graceDurationSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): SubscriptionStatus {
  if (m.paid_through === 0) return 'not_enrolled'
  if (nowSec <= m.paid_through) return 'current'
  if (nowSec <= m.paid_through + graceDurationSec) return 'grace'
  return 'delinquent'
}

// ═══════════════════════════════════════════════════════════════════════════
// VestingNavigator types — ds_vesting_schedules / ds_vesting_claims
// ───────────────────────────────────────────────────────────────────────────
// A VestingNavigator mints shares OR loot to a beneficiary on a cliff + linear
// schedule, minting INCREMENTALLY as tokens vest. Permissioned MANAGER (2), so it
// always indexes as trust_status='sanctioned'.
//
// Two non-obvious things:
//  1. NO ESCROW. Vesting ≠ balance. Unvested/unclaimed tokens don't exist on-chain
//     (no voting power, can't ragequit, can't transfer). Power activates ON claim
//     (which mints). Render real power from ds_members; use these rows only for the
//     schedule/progress/claim UI.
//  2. The cliff is a DELAYED UNLOCK of accrued-since-startTime, not "start accruing
//     at the cliff." A 1y cliff on a 4y vest unlocks 25% in a lump at the cliff, then
//     continues linearly.
//
// status / vested / claimable are TIME-DERIVED (never stored) — mirror the contract.
// `claimed` is the indexer's derive-from-truth SUM(ds_vesting_claims.amount) and is
// authoritative for "how much has been minted" — do NOT re-sum claims client-side.
// All large integers are NUMERIC(78,0) → JSON strings; wrap in BigInt() for math.
// ═══════════════════════════════════════════════════════════════════════════

/** A vesting schedule as stored in ds_vesting_schedules (one per createSchedule). */
export interface VestingScheduleRow {
  /** Composite key: `${navigator_address}-${schedule_id}` */
  id: string
  dao_id: string
  navigator_address: string
  /** Per-navigator, starts at 0 (NUMERIC as string). */
  schedule_id: string
  beneficiary: string
  /** Total to vest over the schedule (wei string). */
  total_amount: string
  /** DERIVED: SUM(ds_vesting_claims.amount) — how much has been minted (wei string). */
  claimed: string
  /** false = shares (dilutes votes on claim), true = loot (economic/ragequit only). */
  is_loot: boolean
  /** Absolute unix seconds (a 0 startTime is resolved to the creation block). */
  start_time: number
  /** Unix seconds — nothing claimable before this (the cliff unlock point). */
  cliff_end: number
  /** Unix seconds — fully vested at/after this. */
  vesting_end: number
  revoked: boolean
  /** Accrual freeze point (null until revoked). */
  revoked_at: number | null
  /** Snapshot from ScheduleRevoked (wei string, null until revoked). */
  vested_at_revoke: string | null
  tx_hash: string
  block_number: number
  created_at: string
  updated_at?: string
}

/** A single incremental claim (mint) as stored in ds_vesting_claims (append-only feed). */
export interface VestingClaimRow {
  /** Composite key: `${tx_hash}-${log_index}` */
  id: string
  /** FK → ds_vesting_schedules.id */
  schedule_pk: string
  dao_id: string
  navigator_address: string
  schedule_id: string
  beneficiary: string
  /** INCREMENTAL amount minted in THIS claim (not cumulative) — wei string. */
  amount: string
  is_loot: boolean
  tx_hash: string
  block_number: number
  created_at: string
}

/** Time-derived vesting status — never stored. See computeVestingStatus(). */
export type VestingStatus = 'pending' | 'vesting' | 'fully_vested' | 'revoked'

/**
 * Mirror of the contract's _vestedAmount: linear from start_time, gated by the cliff.
 * After revoke, accrual is frozen at revoked_at. Returns the total vested (minted +
 * still-claimable), NOT the claimable amount — subtract `claimed` for that.
 */
export function vestedAmount(
  s: Pick<VestingScheduleRow, 'total_amount' | 'revoked' | 'revoked_at' | 'cliff_end' | 'vesting_end' | 'start_time'>,
  nowSec = Math.floor(Date.now() / 1000),
): bigint {
  const total = BigInt(s.total_amount)
  const end = s.revoked && s.revoked_at != null ? s.revoked_at : nowSec
  if (end < s.cliff_end) return 0n
  if (end >= s.vesting_end) return total
  // Linear accrual measured from start_time (the cliff only gates the unlock, not the slope).
  return (total * BigInt(end - s.start_time)) / BigInt(s.vesting_end - s.start_time)
}

/** Mirror of the contract's lifecycle. `revoked` is terminal and overrides. */
export function computeVestingStatus(
  s: Pick<VestingScheduleRow, 'revoked' | 'cliff_end' | 'vesting_end'>,
  nowSec = Math.floor(Date.now() / 1000),
): VestingStatus {
  if (s.revoked) return 'revoked'
  if (nowSec < s.cliff_end) return 'pending'
  if (nowSec >= s.vesting_end) return 'fully_vested'
  return 'vesting'
}

/**
 * Vested-but-not-yet-claimed, clamped at 0. `claimed` is the indexer's authoritative
 * SUM of mints — this is what `claim()` would mint right now.
 */
export function claimable(
  s: Pick<VestingScheduleRow, 'total_amount' | 'claimed' | 'revoked' | 'revoked_at' | 'cliff_end' | 'vesting_end' | 'start_time'>,
  nowSec = Math.floor(Date.now() / 1000),
): bigint {
  const remaining = vestedAmount(s, nowSec) - BigInt(s.claimed)
  return remaining > 0n ? remaining : 0n
}

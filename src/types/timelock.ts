// ═══════════════════════════════════════════════════════════════════════════
// TimelockNavigator types — ds_timelock_changes / ds_governance_config_history
// ───────────────────────────────────────────────────────────────────────────
// A TimelockNavigator wraps DAOShip.setGovernanceConfig behind a mandatory delay:
// a passed proposal QUEUES a config change; it becomes executable only after `delay`
// seconds and stays executable for `expiryWindow` seconds (a SECOND ragequit window).
// Permissioned GOVERNOR (4) → always trust_status='sanctioned'.
//
// ⚠️ ADVISORY, not enforced on-chain: a proposal can bypass it via a direct
// setGovernanceConfig. The app routes config changes through queueChange and WARNS on
// bypasses (ds_governance_config_history.bypassed_timelock) — that warning is the only
// thing that makes the advisory guarantee real to members.
//
// Status is partly time-derived: 'queued'/'executed'/'cancelled' are stored;
// 'executable'/'expired' are clock-derived. See computeTimelockStatus().
// ═══════════════════════════════════════════════════════════════════════════

/** A queued governance-config change as stored in ds_timelock_changes. */
export interface TimelockChangeRow {
  /** Composite key: `${navigator_address}-${change_id}` */
  id: string
  dao_id: string
  navigator_address: string
  /** Per-navigator, starts at 0 (NUMERIC as string). */
  change_id: string
  /** The DAO avatar — a change is always queued via a passed proposal. */
  queued_by: string
  /** keccak256(governanceConfig). */
  config_hash: string
  /** FULL 0x-hex ABI-encoded bytes — required VERBATIM by executeChange (null if not captured). */
  governance_config: string | null
  /** Unix seconds — start of the execution window (the second ragequit window ends here). */
  executable_after: number
  /** Unix seconds — end of the execution window. */
  expires_at: number
  /** STORED status only; 'executable'/'expired' are time-derived. */
  status: 'queued' | 'executed' | 'cancelled'
  executed_tx: string | null
  cancelled_tx: string | null
  /** Queue tx. */
  tx_hash: string
  block_number: number
  created_at: string
  updated_at?: string
}

/** One row per GovernanceConfigSet, with the bypass flag (ds_governance_config_history). */
export interface GovernanceConfigHistoryRow {
  /** Composite key: `${tx_hash}-${log_index}` */
  id: string
  dao_id: string
  voting_period: number
  grace_period: number
  proposal_offering: string
  quorum_percent: string
  sponsor_threshold: string
  min_retention_percent: string
  default_expiry_window: number
  /** TRUE = direct config change on a timelock-enabled DAO — warn in the UI. */
  bypassed_timelock: boolean
  tx_hash: string
  block_number: number
  created_at: string
  updated_at?: string
}

/** Time-derived timelock change status (mirrors the indexer doc). */
export type TimelockChangeStatus = 'queued' | 'executable' | 'expired' | 'executed' | 'cancelled'

/**
 * Stored status takes precedence (executed/cancelled are terminal); otherwise derive
 * from the clock: before executable_after = still in the delay window; within the
 * window = crankable; past expires_at = expired (cancel-only).
 */
export function computeTimelockStatus(
  c: Pick<TimelockChangeRow, 'status' | 'executable_after' | 'expires_at'>,
  nowSec = Math.floor(Date.now() / 1000),
): TimelockChangeStatus {
  if (c.status === 'executed') return 'executed'
  if (c.status === 'cancelled') return 'cancelled'
  if (nowSec < c.executable_after) return 'queued'
  if (nowSec <= c.expires_at) return 'executable'
  return 'expired'
}

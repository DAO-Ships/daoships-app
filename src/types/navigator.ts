// ═══════════════════════════════════════════════════════════════════════════
// Navigator Types - matches ds_navigators and ds_navigator_events tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Numeric navigator permission levels.
 * These map to the bitmask values used in the DAOShip contract.
 *
 * Bit 0 = Admin, Bit 1 = Manager, Bit 2 = Governor
 */
export enum NavigatorPermission {
  None = 0,
  AdminOnly = 1,
  ManagerOnly = 2,
  AdminAndManager = 3,
  GovernorOnly = 4,
  AdminAndGovernor = 5,
  ManagerAndGovernor = 6,
  All = 7,
}

/**
 * String labels matching the `ds_navigator_permission` PostgreSQL enum.
 */
export type NavigatorPermissionLabel =
  | 'none'
  | 'admin'
  | 'manager'
  | 'admin_manager'
  | 'governor'
  | 'admin_governor'
  | 'manager_governor'
  | 'all'

/**
 * Read-only DAO-binding trust for a navigator (ds_navigators.trust_status).
 *
 * Only meaningful for read-only navigators (e.g. SignalNavigator): anyone can deploy a
 * contract that self-asserts a `daoShip`, so the indexer labels how trustworthy that
 * binding is. Permissioned navigators are implicitly `sanctioned` (vouched by NavigatorSet).
 *
 * - `self_asserted` — deployed against the DAO but not (yet) endorsed by governance
 * - `sanctioned`    — DAO endorsed it via a vault `daoships.dao.navigators` post (polls materialize)
 * - `unsanctioned`  — endorsement was revoked
 * - `fabricated`    — weight reconciliation found forged vote weights (terminal; never show)
 */
export type NavigatorTrustStatus = 'self_asserted' | 'sanctioned' | 'unsanctioned' | 'fabricated'

/**
 * Map from numeric permission to its label.
 */
export const NAVIGATOR_PERMISSION_LABELS: Record<NavigatorPermission, NavigatorPermissionLabel> = {
  [NavigatorPermission.None]: 'none',
  [NavigatorPermission.AdminOnly]: 'admin',
  [NavigatorPermission.ManagerOnly]: 'manager',
  [NavigatorPermission.AdminAndManager]: 'admin_manager',
  [NavigatorPermission.GovernorOnly]: 'governor',
  [NavigatorPermission.AdminAndGovernor]: 'admin_governor',
  [NavigatorPermission.ManagerAndGovernor]: 'manager_governor',
  [NavigatorPermission.All]: 'all',
}

/**
 * Represents a navigator as stored in ds_navigators.
 */
export interface Navigator {
  /** Composite key: `${dao_id}-${navigator_address}` */
  id: string
  dao_id: string
  navigator_address: string
  deployer: string | null

  created_at: string

  permission: number
  permission_label: NavigatorPermissionLabel

  /**
   * TRUE once a NavigatorSet(permission > 0) was ever seen for this navigator.
   * Distinguishes a REVOKED permissioned navigator (true, now permission 0) from a
   * born read-only one (false). Monotonic — never reset to false.
   */
  permission_ever_granted: boolean

  /**
   * Read-only DAO-binding trust. Permissioned navigators are always `sanctioned`.
   * GATE read-only navigators' UI on this — see NAVIGATOR_TRUST_CONFIG in types/trust.ts.
   */
  trust_status: NavigatorTrustStatus

  /**
   * "Functional right now?" — NOT a proxy for "has permission". A read-only navigator
   * stays `is_active = true` at permission 0; a revoked navigator goes `is_active = false`.
   * To test "holds a role", use `permission > 0`, never `is_active`.
   */
  is_active: boolean
  paused: boolean

  navigator_type: string | null
  name: string | null
  description: string | null

  /** Block of the NavigatorDeployed event. */
  deploy_block: number | null

  /**
   * Merkle allowlist root cached by the indexer at NavigatorDeployed time (bytes32 hex).
   * NULL when the navigator has no allowlist or allowlistRoot() reverted. Optional — the
   * indexer already verifies allowlist Poster records against this; the app can compare
   * against a claimed root to pre-verify, but doesn't need to.
   */
  allowlist_root: string | null

  /**
   * Indexer-cached navigator config (JSONB). Shape depends on navigator_type.
   * Stale relative to on-chain state — use `useNavigatorConfig` for live reads.
   * Null when indexer hasn't fetched config yet (or for unknown types).
   */
  config: Record<string, unknown> | null

  tx_hash: string
}

/**
 * Represents a navigator event as stored in ds_navigator_events.
 * Events include onboard actions from navigator contracts.
 */
export interface NavigatorEvent {
  id: string
  dao_id: string
  navigator_address: string
  event_type: string
  contributor: string
  shares_minted: string
  loot_minted: string
  amount: string
  metadata: Record<string, unknown> | null

  created_at: string
  tx_hash: string
  /** BIGINT from indexer — safe as number (blocks stay < 2^53 for centuries) */
  block_number: number
}

/**
 * A per-token NFT claim, as stored in ds_nft_claims (NFTGatedNavigator only).
 * One row per claimed tokenId — a token can be claimed exactly once, ever.
 */
export interface NftClaim {
  /** Composite key: `${navigator_address}-${token_id}` */
  id: string
  dao_id: string
  navigator_address: string
  /** NUMERIC(78,0) from the indexer — kept as a string; can exceed 2^53. */
  token_id: string
  /** The claimer AT CLAIM TIME — historical, not the current NFT owner. */
  holder: string
  /** Raw wei strings. */
  shares: string
  loot: string
  tx_hash: string
  /** BIGINT from indexer — safe as number. */
  block_number: number
  created_at: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SignalNavigator polls — ds_signal_polls / ds_signal_votes
// ───────────────────────────────────────────────────────────────────────────
// Non-binding, share-weighted "temperature check" polls. Rows are materialized by
// the indexer ONLY for navigators with trust_status === 'sanctioned'; a self_asserted
// navigator legitimately has zero poll rows (not a bug). Poll status is TIME-DERIVED
// (no status column) — use computeSignalPollStatus().
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A SignalNavigator poll as stored in ds_signal_polls.
 * `poll_id` and `tally[]` are NUMERIC(78,0) — kept as strings (can exceed 2^53).
 */
export interface SignalPollRow {
  /** Composite key: `${navigator_address}-${poll_id}` */
  id: string
  dao_id: string
  navigator_address: string
  /** Per-navigator, starts at 0 (NUMERIC as string). */
  poll_id: string
  creator: string
  /** IPFS CID or short text — resolve CIDs off-chain. */
  question: string | null
  /** 2..10 */
  option_count: number
  /** votingStarts - 1 (the weight measurement timepoint). */
  snapshot_timestamp: number
  /** Unix seconds. */
  voting_starts: number
  /** Unix seconds. Half-open window: [voting_starts, voting_ends). */
  voting_ends: number
  cancelled: boolean
  /**
   * Per-option running totals (index = option), NUMERIC[] as strings. This is the
   * authoritative, snapshot-weighted result — never re-sum votes or read chain balances.
   */
  tally: string[]
  // ── Off-chain option labels (daoships.signal.poll Poster post by the creator) ──
  // NULL until the labels post is indexed; the indexer ignores label edits once the poll
  // is ended/cancelled. `options[i]` labels option index i; length always equals option_count
  // when present (mismatched posts are discarded). Always fall back via signalOptionLabel().
  options?: string[] | null
  description?: string | null
  discussion_url?: string | null
  /** Last-write-wins timestamp of the labels post (ISO string). */
  labels_updated_at?: string | null
  /** Block of the labels post (reorg bookkeeping). */
  labels_block_number?: number | null
  tx_hash: string
  block_number: number
  created_at: string
  updated_at?: string
}

/**
 * Human-readable label for option index `i`, falling back to a numeric label when the poll
 * has no indexed `daoships.signal.poll` labels post (or it was discarded). Mirrors the
 * indexer's documented render rule.
 */
export function signalOptionLabel(poll: Pick<SignalPollRow, 'options'>, i: number): string {
  const label = poll.options?.[i]
  return label && label.trim() !== '' ? label : `Option ${i + 1}`
}

/**
 * A single vote on a SignalNavigator poll as stored in ds_signal_votes.
 * One row per address per poll (enforced on-chain).
 */
export interface SignalVoteRow {
  /** Composite key: `${navigator_address}-${poll_id}-${voter}` */
  id: string
  /** FK → ds_signal_polls.id */
  poll_pk: string
  dao_id: string
  navigator_address: string
  poll_id: string
  voter: string
  /** 0..option_count-1 */
  option: number
  /** SHARE voting power at snapshot (loot excluded), NUMERIC as string. */
  weight: string
  tx_hash: string
  block_number: number
  created_at: string
}

/** Time-derived poll status — never stored. See computeSignalPollStatus(). */
export type SignalPollStatus = 'pending' | 'active' | 'ended' | 'cancelled'

/**
 * Mirror of the contract's pollStatus(). Status is derived from the clock, never
 * persisted (it would go stale). `cancelled` is terminal and overrides the rest.
 */
export function computeSignalPollStatus(
  poll: Pick<SignalPollRow, 'cancelled' | 'voting_starts' | 'voting_ends'>,
  nowSec = Math.floor(Date.now() / 1000),
): SignalPollStatus {
  if (poll.cancelled) return 'cancelled'
  if (nowSec < poll.voting_starts) return 'pending'
  if (nowSec >= poll.voting_ends) return 'ended' // half-open window [voting_starts, voting_ends)
  return 'active'
}

import type { NavigatorTrustStatus } from './navigator'

// ═══════════════════════════════════════════════════════════════════════════
// Trust Level Types - matches the indexer's poster trust model
// ═══════════════════════════════════════════════════════════════════════════
//
// Canonical casing: UPPERCASE (matches what the indexer stores in ds_records.trust_level).
// Never lowercase trust levels on the client — the DB is the source of truth.

export type TrustLevel =
  | 'VERIFIED'
  | 'VERIFIED_INITIAL'
  | 'SEMI_TRUSTED'
  | 'ON_CHAIN_PROVISIONAL'
  | 'MEMBER'
  | 'UNTRUSTED'

export const TRUST_LEVELS = {
  VERIFIED: 'VERIFIED' as TrustLevel,
  VERIFIED_INITIAL: 'VERIFIED_INITIAL' as TrustLevel,
  SEMI_TRUSTED: 'SEMI_TRUSTED' as TrustLevel,
  ON_CHAIN_PROVISIONAL: 'ON_CHAIN_PROVISIONAL' as TrustLevel,
  MEMBER: 'MEMBER' as TrustLevel,
  UNTRUSTED: 'UNTRUSTED' as TrustLevel,
}

export interface TrustBadgeConfig {
  label: string
  colorClass: string
  borderClass: string
  description: string
}

export const TRUST_LEVEL_CONFIG: Record<TrustLevel, TrustBadgeConfig> = {
  VERIFIED: {
    label: 'Verified',
    colorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-500/30',
    description: 'Posted by DAO vault or DAOShip contract (governance-voted)',
  },
  VERIFIED_INITIAL: {
    label: 'Deployer',
    colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    borderClass: 'border-blue-500/30',
    description: 'Posted by the original deployer wallet',
  },
  SEMI_TRUSTED: {
    label: 'Navigator',
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-500/30',
    description: 'Posted by a Navigator contract',
  },
  ON_CHAIN_PROVISIONAL: {
    label: 'Provisional',
    colorClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    borderClass: 'border-orange-500/30',
    description: 'Pre-DAO on-chain allowlist record (verified against Merkle root)',
  },
  MEMBER: {
    label: 'Member',
    colorClass: 'bg-dao-dark-4/30 text-dao-text-secondary',
    borderClass: 'border-dao-border/30',
    description: 'Posted by a wallet with shares > 0',
  },
  UNTRUSTED: {
    label: 'Unverified',
    colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    borderClass: 'border-red-500/30',
    description: 'Trust level could not be determined',
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigator Trust Status - matches ds_navigators.trust_status
// ───────────────────────────────────────────────────────────────────────────
// Distinct from the Poster TrustLevel above: this gates whether a read-only
// navigator (and its polls) should be shown. A self_asserted SignalNavigator is
// indistinguishable on-chain from a sanctioned one — trust_status is the only
// guard, so DEFAULT TO THE SAFE VIEW.
// ═══════════════════════════════════════════════════════════════════════════

export interface NavigatorTrustConfig extends TrustBadgeConfig {
  /**
   * Whether this status should appear in the default feed. `self_asserted` is
   * shown only behind an explicit "show unverified" opt-in; the rest are hidden.
   */
  showByDefault: boolean
}

export const NAVIGATOR_TRUST_CONFIG: Record<NavigatorTrustStatus, NavigatorTrustConfig> = {
  sanctioned: {
    label: 'Sanctioned',
    colorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-500/30',
    description: 'Endorsed by the DAO via a governance-voted vault post',
    showByDefault: true,
  },
  self_asserted: {
    label: 'Unverified',
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-500/30',
    description: 'Deployed against this DAO but not yet endorsed by governance',
    showByDefault: false,
  },
  unsanctioned: {
    label: 'Revoked',
    colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    borderClass: 'border-red-500/30',
    description: 'The DAO revoked its endorsement of this navigator',
    showByDefault: false,
  },
  fabricated: {
    label: 'Fabricated',
    colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    borderClass: 'border-red-500/30',
    description: 'Forged vote weights detected — never shown',
    showByDefault: false,
  },
}

/**
 * Whether a navigator should appear in the default UI.
 *
 * Permissioned navigators (permission > 0, or ever granted) are always shown — their
 * trust is vouched by NavigatorSet. Read-only navigators are gated on trust_status;
 * `self_asserted` surfaces only when `includeUnverified` is set (the "show unverified" toggle).
 */
export function isNavigatorVisible(
  nav: { permission: number; permission_ever_granted: boolean; trust_status: NavigatorTrustStatus },
  includeUnverified = false,
): boolean {
  if (nav.permission > 0 || nav.permission_ever_granted) return true
  if (nav.trust_status === 'sanctioned') return true
  if (nav.trust_status === 'self_asserted') return includeUnverified
  return false
}

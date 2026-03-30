// ═══════════════════════════════════════════════════════════════════════════
// Trust Level Types - matches the indexer's poster trust model
// ═══════════════════════════════════════════════════════════════════════════

export type TrustLevel =
  | 'verified'
  | 'verified_initial'
  | 'semi_trusted'
  | 'member'
  | 'untrusted'

export const TRUST_LEVELS = {
  VERIFIED: 'verified' as TrustLevel,
  VERIFIED_INITIAL: 'verified_initial' as TrustLevel,
  SEMI_TRUSTED: 'semi_trusted' as TrustLevel,
  MEMBER: 'member' as TrustLevel,
  UNTRUSTED: 'untrusted' as TrustLevel,
}

export interface TrustBadgeConfig {
  label: string
  colorClass: string
  borderClass: string
  description: string
}

export const TRUST_LEVEL_CONFIG: Record<TrustLevel, TrustBadgeConfig> = {
  verified: {
    label: 'Verified',
    colorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-500/30',
    description: 'Posted by DAO vault or DAOShip contract (governance-voted)',
  },
  verified_initial: {
    label: 'Deployer',
    colorClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    borderClass: 'border-blue-500/30',
    description: 'Posted by the original deployer wallet',
  },
  semi_trusted: {
    label: 'Navigator',
    colorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-500/30',
    description: 'Posted by a Navigator contract',
  },
  member: {
    label: 'Member',
    colorClass: 'bg-dao-dark-4/30 text-dao-text-secondary',
    borderClass: 'border-dao-border/30',
    description: 'Posted by a wallet with shares > 0',
  },
  untrusted: {
    label: 'Unverified',
    colorClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    borderClass: 'border-red-500/30',
    description: 'Trust level could not be determined',
  },
}

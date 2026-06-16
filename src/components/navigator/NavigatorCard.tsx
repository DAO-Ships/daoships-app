import { Link } from 'react-router-dom'
import type { Navigator } from '@/types'
import { NavigatorPermission } from '@/types'
import { NavigatorGlyph } from './NavigatorGlyph'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { isNavigatorExpired, navigatorTypeHasExpiry } from '@/utils/navigatorExpiry'
import { navigatorNeedsSanction } from '@/utils/navigatorSanction'
import { NAVIGATOR_TRUST_CONFIG } from '@/types/trust'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorCard - Navigator address, permission badge, and type label
// ═══════════════════════════════════════════════════════════════════════════

interface NavigatorCardProps {
  navigator: Navigator
}

/**
 * Decode the permission bitmask into human-readable permission badges.
 * Bit 0 = Admin, Bit 1 = Manager, Bit 2 = Governor
 */
function getPermissionBadges(permission: number): Array<{ label: string; className: string }> {
  const badges: Array<{ label: string; className: string }> = []

  if (permission === NavigatorPermission.None) {
    badges.push({
      label: 'None',
      className: 'bg-dao-surface/50 text-dao-text-muted border-dao-border/30',
    })
    return badges
  }

  if (permission & NavigatorPermission.AdminOnly) {
    badges.push({
      label: 'Admin',
      className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    })
  }
  if (permission & NavigatorPermission.ManagerOnly) {
    badges.push({
      label: 'Manager',
      className: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
    })
  }
  if (permission & NavigatorPermission.GovernorOnly) {
    badges.push({
      label: 'Governor',
      className: 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
    })
  }

  return badges
}

/**
 * Attempt to identify a navigator type from its address or metadata.
 * Falls back to "Custom Navigator".
 */
function getNavigatorTypeLabel(navigator: Navigator): string {
  // Use navigator_type if available
  if (navigator.navigator_type) return navigator.navigator_type

  // In the future, could match against known navigator contracts
  // For now, use the permission label as a hint
  if (navigator.permission === NavigatorPermission.All) return 'Full-Permission Navigator'
  if (navigator.permission === NavigatorPermission.AdminAndManager) return 'Admin/Manager Navigator'
  if (navigator.permission === NavigatorPermission.ManagerAndGovernor) return 'Manager/Governor Navigator'
  if (navigator.permission === NavigatorPermission.AdminOnly) return 'Admin Navigator'
  if (navigator.permission === NavigatorPermission.ManagerOnly) return 'Manager Navigator'
  if (navigator.permission === NavigatorPermission.GovernorOnly) return 'Governor Navigator'
  return 'Custom Navigator'
}

export function NavigatorCard({ navigator }: NavigatorCardProps) {
  const permissionBadges = getPermissionBadges(navigator.permission)
  const typeLabel = getNavigatorTypeLabel(navigator)

  // Only fetch on-chain config for active navigators of types that carry an expiry.
  // Hook is cached by address (5min staleTime) so revisits / detail navigation are free.
  const shouldCheckExpiry = navigator.is_active && navigatorTypeHasExpiry(navigator.navigator_type)
  const { data: configResult } = useNavigatorConfig(
    shouldCheckExpiry ? navigator.navigator_address : undefined,
  )
  const expiry = (configResult?.config as { expiry?: bigint } | null)?.expiry
  const expired = isNavigatorExpired(expiry)

  // Trust badge only matters for read-only navigators (no permission, never granted) — their
  // DAO binding is self-asserted. Permissioned navigators are vouched by NavigatorSet, so we
  // don't badge them (their permission badges already convey authority).
  const isReadOnly = navigator.permission === NavigatorPermission.None && !navigator.permission_ever_granted
  const trustBadge = isReadOnly ? NAVIGATOR_TRUST_CONFIG[navigator.trust_status] : null

  // Listed but not actionable — a member can propose to activate it (see detail page).
  const needsActivation = navigatorNeedsSanction(navigator)

  return (
    <Link
      to={navigator.navigator_address}
      className="block"
    >
      <div className={`card px-5 py-4 hover:border-primary-500/40 transition-colors ${!navigator.is_active ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-4">
          {/* Icon */}
          <NavigatorGlyph type={navigator.navigator_type || ''} size="sm" tone="accent" />

          {/* Name, type, address */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-dao-text truncate">
                {navigator.name || typeLabel}
              </p>
              <span
                className="inline-flex items-center flex-shrink-0 text-2xs font-medium px-1.5 py-0.5 rounded bg-dao-surface/60 text-dao-text-hint border border-dao-border/40"
                title="Metadata set by navigator deployer, not governance-approved"
                aria-label="Deployer-authored metadata"
              >
                Deployer
              </span>
              {trustBadge && (
                <span
                  className={`inline-flex items-center flex-shrink-0 text-2xs font-medium px-1.5 py-0.5 rounded border ${trustBadge.colorClass} ${trustBadge.borderClass}`}
                  title={trustBadge.description}
                >
                  {trustBadge.label}
                </span>
              )}
              {needsActivation && (
                <span
                  className="text-xs text-accent-400 bg-accent-500/10 border border-accent-500/30 px-1.5 py-0.5 rounded"
                  title="Listed but not active yet — a member can propose to activate it"
                >
                  Needs activation
                </span>
              )}
              {!navigator.is_active && !needsActivation && (
                <span className="text-xs text-dao-text-hint bg-dao-surface/50 px-1.5 py-0.5 rounded">
                  Disabled
                </span>
              )}
              {navigator.paused && navigator.is_active && (
                <span className="text-xs text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded">
                  Paused
                </span>
              )}
              {expired && (
                <span className="text-xs text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded">
                  Expired
                </span>
              )}
            </div>
            {navigator.description && (
              <p className="text-xs text-dao-text-muted mt-0.5 line-clamp-1">{navigator.description}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              {navigator.name && (
                <p className="text-xs text-dao-text-hint">{typeLabel}</p>
              )}
              <p className="text-xs text-dao-text-hint font-mono" title={navigator.navigator_address}>
                {navigator.navigator_address.slice(0, 6)}...{navigator.navigator_address.slice(-4)}
              </p>
            </div>
          </div>

          {/* Right: Permission badges + chevron */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {permissionBadges.map((badge) => (
                <span
                  key={badge.label}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badge.className}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <svg aria-hidden="true" className="w-4 h-4 text-dao-text-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

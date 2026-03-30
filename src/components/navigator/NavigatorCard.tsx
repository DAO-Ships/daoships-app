import { Link } from 'react-router-dom'
import type { Navigator } from '@/types'
import { NavigatorPermission } from '@/types'
import { getNavigatorIcon, getCatalogEntry } from '@/config/navigatorCatalog'

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
      className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
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

  return (
    <Link
      to={navigator.navigator_address}
      className="block"
    >
      <div className={`card px-5 py-4 hover:border-primary-500/40 transition-colors ${!navigator.is_active ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-accent-500/10 border border-accent-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-accent-400" viewBox="0 0 24 24" fill="currentColor">
              <path d={getNavigatorIcon(navigator.navigator_type || '')} />
            </svg>
          </div>

          {/* Name, type, address */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-dao-text truncate">
                {navigator.name || typeLabel}
              </p>
              {!navigator.is_active && (
                <span className="text-xs text-dao-text-hint bg-dao-surface/50 px-1.5 py-0.5 rounded">
                  Disabled
                </span>
              )}
              {navigator.paused && navigator.is_active && (
                <span className="text-xs text-yellow-500 bg-yellow-500/20 px-1.5 py-0.5 rounded">
                  Paused
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
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
            <svg className="w-4 h-4 text-dao-text-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

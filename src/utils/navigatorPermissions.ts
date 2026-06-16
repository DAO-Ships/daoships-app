// ═══════════════════════════════════════════════════════════════════════════
// Navigator Permission Display Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tailwind classes for navigator permission badge styling.
 */
export const PERMISSION_COLORS: Record<string, string> = {
  none: 'bg-dao-surface text-dao-text-hint',
  None: 'bg-dao-surface text-dao-text-hint',
  admin: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  manager: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
  admin_manager: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
  governor: 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400',
  admin_governor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400',
  manager_governor: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400',
  all: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
  MANAGER: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
  ADMIN: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  ALL: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
}

/**
 * Format a permission label for display (e.g. "admin_manager" -> "Admin + Manager").
 */
export function formatPermissionLabel(label: string): string {
  return label
    .replace(/_/g, ' + ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

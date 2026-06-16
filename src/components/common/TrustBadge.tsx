// ═══════════════════════════════════════════════════════════════════════════
// TrustBadge - Displays a colored badge for poster trust level
// ═══════════════════════════════════════════════════════════════════════════

import type { TrustLevel } from '@/types'
import { TRUST_LEVEL_CONFIG } from '@/types'

interface TrustBadgeProps {
  level: TrustLevel
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2.5 py-1',
} as const

export function TrustBadge({ level, size = 'sm' }: TrustBadgeProps) {
  const config = TRUST_LEVEL_CONFIG[level]
  // Guard against unknown trust levels (schema drift) — render nothing instead of crashing
  if (!config) return null

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${config.colorClass} ${config.borderClass} ${sizeClasses[size]}`}
      title={config.description}
    >
      {config.label}
    </span>
  )
}

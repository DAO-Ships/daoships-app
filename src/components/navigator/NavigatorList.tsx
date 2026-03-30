import type { Navigator } from '@/types'
import { NavigatorCard } from './NavigatorCard'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorList - List of DAO's navigators
// ═══════════════════════════════════════════════════════════════════════════

interface NavigatorListProps {
  navigators: Navigator[]
}

export function NavigatorList({ navigators }: NavigatorListProps) {
  if (navigators.length === 0) {
    return (
      <div className="card px-6 py-8 text-center">
        <p className="text-dao-text-hint">No navigators configured for this DAO</p>
      </div>
    )
  }

  // Sort: active first, then by permission level descending
  const sorted = [...navigators].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return b.permission - a.permission
  })

  return (
    <div className="space-y-2">
      {sorted.map((navigator) => (
        <NavigatorCard key={navigator.id} navigator={navigator} />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Skeleton — Shimmer placeholder for loading states
// ═══════════════════════════════════════════════════════════════════════════

interface SkeletonProps {
  className?: string
  /** Width (Tailwind class like w-full, w-32, etc.) */
  width?: string
  /** Height (Tailwind class like h-4, h-8, etc.) */
  height?: string
  /** Border radius variant */
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'none'
}

export function Skeleton({ className = '', width = 'w-full', height = 'h-4', rounded = 'md' }: SkeletonProps) {
  const roundedClass = rounded === 'none' ? '' : `rounded-${rounded}`
  return (
    <div
      className={`bg-dao-surface ${roundedClass} ${width} ${height} overflow-hidden ${className}`}
    >
      <div className="w-full h-full animate-shimmer bg-gradient-to-r from-transparent via-dao-border/30 to-transparent bg-[length:2000px_100%]" />
    </div>
  )
}

/** Pre-built skeleton for a card with lines of text */
export function SkeletonCard({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`card px-5 py-4 space-y-3 ${className}`}>
      <Skeleton height="h-5" width="w-2/3" />
      {Array.from({ length: lines - 1 }, (_, i) => (
        <Skeleton key={i} height="h-3" width={i % 2 === 0 ? 'w-full' : 'w-4/5'} />
      ))}
    </div>
  )
}

/** Pre-built skeleton for a DaoCard in the Explore grid */
export function SkeletonDaoCard() {
  return (
    <div className="card px-5 py-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton width="w-10" height="h-10" rounded="full" />
        <Skeleton height="h-5" width="w-32" />
      </div>
      <Skeleton height="h-3" width="w-full" />
      <Skeleton height="h-3" width="w-3/4" />
      <div className="flex gap-4 pt-1">
        <Skeleton height="h-3" width="w-20" />
        <Skeleton height="h-3" width="w-20" />
      </div>
    </div>
  )
}

/** Pre-built skeleton for a proposal card */
export function SkeletonProposalCard() {
  return (
    <div className="card px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton width="w-8" height="h-4" />
          <Skeleton width="w-48" height="h-4" />
        </div>
        <Skeleton width="w-16" height="h-6" rounded="full" />
      </div>
      <Skeleton height="h-1.5" rounded="full" />
    </div>
  )
}

/** Pre-built skeleton for a member table row */
export function SkeletonMemberRow() {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <Skeleton width="w-8" height="h-8" rounded="full" />
        <div className="space-y-1">
          <Skeleton width="w-24" height="h-4" />
          <Skeleton width="w-32" height="h-3" />
        </div>
      </div>
      <div className="flex gap-6">
        <Skeleton width="w-16" height="h-4" />
        <Skeleton width="w-16" height="h-4" />
        <Skeleton width="w-12" height="h-4" />
      </div>
    </div>
  )
}

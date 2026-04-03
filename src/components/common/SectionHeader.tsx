import type { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// SectionHeader — Consistent title + action pattern for page sections
// ═══════════════════════════════════════════════════════════════════════════

interface SectionHeaderProps {
  title: string
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <h2 className="text-xl font-semibold text-dao-text">{title}</h2>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

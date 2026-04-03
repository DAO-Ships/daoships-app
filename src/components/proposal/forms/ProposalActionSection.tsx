import type { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalActionSection — Visual wrapper for the "what this proposal does" zone
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalActionSectionProps {
  title: string
  children: ReactNode
  className?: string
}

export function ProposalActionSection({ title, children, className = '' }: ProposalActionSectionProps) {
  return (
    <div className={`border border-dao-border rounded-lg ${className}`}>
      <div className="px-4 py-2 bg-dao-dark-2 border-b border-dao-border rounded-t-lg">
        <h3 className="text-xs font-semibold text-dao-text-hint uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4 py-4 space-y-4">
        {children}
      </div>
    </div>
  )
}

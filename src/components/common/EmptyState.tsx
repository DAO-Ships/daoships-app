import type { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// EmptyState - Placeholder for empty lists
// ═══════════════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon ? (
        <div className="mb-4 text-dao-text-hint">{icon}</div>
      ) : (
        <div className="mb-4">
          <svg
            className="w-16 h-16 text-dao-text-hint"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
      )}

      <h3 className="text-lg font-semibold text-dao-text-secondary">{title}</h3>

      {description && (
        <p className="mt-2 text-sm text-dao-text-muted max-w-md">{description}</p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

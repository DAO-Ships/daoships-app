import type { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// Card - Content card with optional header and footer
// ═══════════════════════════════════════════════════════════════════════════

interface CardProps {
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
  className?: string
}

export function Card({ children, header, footer, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {header && (
        <div className="px-6 py-4 border-b border-dao-border">
          {header}
        </div>
      )}
      <div className="px-6 py-4">
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-dao-border">
          {footer}
        </div>
      )}
    </div>
  )
}

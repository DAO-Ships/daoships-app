import { Link } from 'react-router-dom'

// ═══════════════════════════════════════════════════════════════════════════
// Breadcrumb - Consistent navigation trail for DAO sub-pages
// ═══════════════════════════════════════════════════════════════════════════

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-dao-text-muted">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-dao-text-hint">/</span>}
          {item.href ? (
            <Link
              to={item.href}
              className="hover:text-primary-400 transition-colors truncate max-w-[200px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-dao-text-hint truncate max-w-[200px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

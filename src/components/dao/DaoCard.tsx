import { Link } from 'react-router-dom'
import type { Dao } from '@/types'
import { formatCompactNumber } from '@/utils/format'
import { DaoAvatar } from './DaoAvatar'

// ═══════════════════════════════════════════════════════════════════════════
// DaoCard - Summary card for the Explore page DAO list
// ═══════════════════════════════════════════════════════════════════════════

interface DaoCardProps {
  dao: Dao
}

export function DaoCard({ dao }: DaoCardProps) {
  const memberCount = Number(dao.active_member_count || '0')
  const proposalCount = Number(dao.proposal_count || '0')

  return (
    <Link
      to={`/dao/${dao.id}`}
      className="card group block transition-all duration-200 hover:border-accent-500/50 hover:shadow-accent-500/10 hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="px-6 py-5">
        {/* Header: Avatar + Name */}
        <div className="flex items-center gap-3 mb-3">
          <DaoAvatar src={dao.avatar_img} alt={dao.name || 'DAO'} size="md" />
          <h3 className="text-lg font-semibold text-dao-text truncate group-hover:text-accent-400 transition-colors">
            {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
          </h3>
        </div>

        {/* Description */}
        {dao.description && (
          <p className="text-sm text-dao-text-muted line-clamp-2 mb-4">
            {dao.description}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-dao-text-muted">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{formatCompactNumber(memberCount)} members</span>
          </div>
          <div className="flex items-center gap-1.5 text-dao-text-muted">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{formatCompactNumber(proposalCount)} proposals</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

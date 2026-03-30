import type { Dao } from '@/types'
import { formatTokenAmount, formatCompactNumber } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// DaoStats - Key metrics display for DAO overview
// ═══════════════════════════════════════════════════════════════════════════

interface DaoStatsProps {
  dao: Dao
  memberCount?: number
  proposalCount?: number
  treasuryValue?: string
}

interface StatItem {
  label: string
  value: string
  accent?: boolean
}

export function DaoStats({ dao, memberCount, proposalCount, treasuryValue }: DaoStatsProps) {
  const totalShares = BigInt(dao.total_shares || '0')
  const totalLoot = BigInt(dao.total_loot || '0')
  const members = memberCount ?? Number(dao.active_member_count || '0')
  const proposals = proposalCount ?? Number(dao.proposal_count || '0')

  const stats: StatItem[] = [
    {
      label: 'Total Shares',
      value: formatTokenAmount(totalShares),
    },
    {
      label: 'Total Loot',
      value: formatTokenAmount(totalLoot),
    },
    {
      label: 'Members',
      value: formatCompactNumber(members),
    },
    {
      label: 'Proposals',
      value: formatCompactNumber(proposals),
    },
  ]

  if (treasuryValue) {
    stats.push({
      label: 'Treasury',
      value: treasuryValue,
      accent: true,
    })
  }

  return (
    <div className="border-t border-dao-border bg-dao-dark-2/50 backdrop-blur-sm px-6 sm:px-8 lg:px-10 py-4 sm:py-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`${
              i < stats.length - 1
                ? 'lg:border-r lg:border-dao-border/50 lg:pr-6'
                : ''
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-dao-text-muted">
              {stat.label}
            </p>
            <p className={`text-xl sm:text-2xl font-display font-bold mt-1 ${
              stat.accent ? 'text-accent-400' : 'text-dao-text'
            }`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

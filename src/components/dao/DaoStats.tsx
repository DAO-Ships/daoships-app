import { useState, useEffect, useRef } from 'react'
import type { Dao } from '@/types'
import { formatTokenAmount, formatCompactNumber } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'

/** Animate a number counting up from 0 on mount */
function useCountUp(target: string, duration = 600): string {
  const [display, setDisplay] = useState('0')
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) { setDisplay(target); return }
    mounted.current = true

    // Extract the numeric part for animation
    const match = target.match(/^([\d,.]+)/)
    if (!match) { setDisplay(target); return }
    const numStr = match[1].replace(/,/g, '')
    const targetNum = parseFloat(numStr)
    if (isNaN(targetNum) || targetNum === 0) { setDisplay(target); return }

    const startTime = performance.now()
    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out curve
      const eased = 1 - (1 - progress) ** 3
      const current = targetNum * eased
      // Format to match target's precision
      const formatted = numStr.includes('.')
        ? current.toFixed(numStr.split('.')[1]?.length ?? 0)
        : Math.round(current).toLocaleString()
      setDisplay(target.replace(match[1], formatted))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])

  return display
}

function AnimatedValue({ value, className }: { value: string; className: string }) {
  const animated = useCountUp(value)
  return <p className={className}>{animated}</p>
}

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
  const totalShares = safeBigInt(dao.total_shares)
  const totalLoot = safeBigInt(dao.total_loot)
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
            <AnimatedValue value={stat.value} className={`text-xl sm:text-2xl font-display font-bold mt-1 ${
              stat.accent ? 'text-accent-400' : 'text-dao-text'
            }`} />
          </div>
        ))}
      </div>
    </div>
  )
}

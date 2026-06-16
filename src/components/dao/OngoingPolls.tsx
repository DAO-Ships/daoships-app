import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Navigator, SignalPollRow } from '@/types'
import { computeSignalPollStatus } from '@/types'
import { navigatorIndexerService } from '@/services/indexer/NavigatorIndexerService'
import { usePageVisibility } from '@/hooks/usePageVisibility'
import { Card } from '@/components/common/Card'
import { formatCountdown } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// OngoingPolls - surfaces currently-open SignalNavigator polls on the DAO overview.
// ───────────────────────────────────────────────────────────────────────────
// Renders nothing unless at least one sanctioned, active SignalNavigator has a poll
// whose voting window is open right now. Handles multiple signal navigators (one
// poll query each via useQueries) and links into the navigator detail page to vote.
// ═══════════════════════════════════════════════════════════════════════════

interface OngoingPollsProps {
  daoId: string
  navigators: Navigator[] | undefined
}

export function OngoingPolls({ daoId, navigators }: OngoingPollsProps) {
  const isVisible = usePageVisibility()

  // The indexer only returns poll rows for sanctioned navigators; an inactive or
  // self-asserted SignalNavigator has no surfaced polls, so skip those entirely.
  const signalNavs = (navigators ?? []).filter(
    (n) => n.navigator_type === 'SignalNavigator' && n.is_active && n.trust_status === 'sanctioned',
  )

  const pollQueries = useQueries({
    queries: signalNavs.map((nav) => ({
      queryKey: ['signalPolls', daoId, nav.navigator_address.toLowerCase()],
      queryFn: () => navigatorIndexerService.listSignalPolls(daoId, nav.navigator_address),
      enabled: !!daoId,
      refetchInterval: isVisible ? 30000 : false,
    })),
  })

  // Flatten to currently-open polls, tagged with their navigator for the vote link.
  const activePolls = signalNavs
    .flatMap((nav, i) => {
      const rows = (pollQueries[i]?.data ?? []) as SignalPollRow[]
      return rows
        .filter((p) => computeSignalPollStatus(p) === 'active')
        .map((poll) => ({ poll, navigatorAddress: nav.navigator_address }))
    })
    // Soonest to close first.
    .sort((a, b) => a.poll.voting_ends - b.poll.voting_ends)

  if (activePolls.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-dao-text">Active Signal Polls</h2>
        <span className="text-xs text-dao-text-hint">Non-binding temperature checks</span>
      </div>
      <Card>
        <div className="divide-y divide-dao-border">
          {activePolls.map(({ poll, navigatorAddress }) => {
            const totalWeight = poll.tally.reduce((sum, t) => sum + BigInt(t), 0n)
            return (
              <Link
                key={poll.id}
                to={`/dao/${daoId}/navigators/${navigatorAddress}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-dao-surface/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-dao-text font-medium truncate block">
                    {poll.question || `Poll #${poll.poll_id}`}
                  </span>
                  <p className="text-xs text-dao-text-hint mt-0.5">
                    Closes in {formatCountdown(poll.voting_ends)} · {poll.option_count} options
                    {totalWeight > 0n ? ' · votes cast' : ' · no votes yet'}
                  </p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                  Active
                </span>
              </Link>
            )
          })}
        </div>
      </Card>
    </section>
  )
}

import { useState, useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { Dao, Proposal, DaoExpiryConfig } from '@/types'
import { ProposalStatus, deriveProposalStatus } from '@/types/proposal'
import { useProposals } from '@/hooks/useProposals'
import { safeBigInt } from '@/utils/bigint'
import { Button } from '@/components/common/Button'
import { Card } from '@/components/common/Card'
import { SkeletonProposalCard } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatTimeAgo } from '@/utils/time'
import { parseProposalDetails } from '@/utils/format'
import { getProposalType } from '@/utils/proposalTypes'

// ═══════════════════════════════════════════════════════════════════════════
// Proposals - Proposal list with status filter tabs and type indicators
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

type FilterTab = 'all' | 'voting' | 'grace' | 'ready' | 'passed' | 'failed'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'voting', label: 'Voting' },
  { value: 'grace', label: 'Grace' },
  { value: 'ready', label: 'Ready' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
]

interface ProposalWithStatus {
  proposal: Proposal
  status: string
}

function matchesFilter({ status, proposal }: ProposalWithStatus, filter: FilterTab): boolean {
  if (filter === 'all') return true
  switch (filter) {
    case 'voting': return status === ProposalStatus.Voting
    case 'grace': return status === ProposalStatus.Grace
    case 'ready': return status === ProposalStatus.Ready
    case 'passed': return status === ProposalStatus.Processed && proposal.passed
    case 'failed': return (
      status === ProposalStatus.Defeated ||
      status === ProposalStatus.Cancelled ||
      status === ProposalStatus.Expired ||
      status === ProposalStatus.ActionFailed
    )
    default: return true
  }
}

function ProposalCard({ proposal, daoId, status }: { proposal: Proposal; daoId: string; status: string }) {
  const details = parseProposalDetails(proposal.details)
  const yesBalance = safeBigInt(proposal.yes_balance)
  const noBalance = safeBigInt(proposal.no_balance)
  const totalBalance = yesBalance + noBalance
  const yesPercent = totalBalance > 0n ? Number((yesBalance * 100n) / totalBalance) : 0
  const noPercent = totalBalance > 0n ? 100 - yesPercent : 0

  const proposalType = getProposalType(proposal.details, proposal.proposal_data)

  return (
    <Link
      to={`/dao/${daoId}/proposals/${proposal.proposal_id}`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-dao-surface/50 transition-colors"
    >
      {/* ID */}
      <span className="text-xs font-mono text-dao-text-hint w-8 flex-shrink-0">#{proposal.proposal_id}</span>

      {/* Type badge */}
      <div className="w-20 flex-shrink-0">
        {proposalType && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${proposalType.color}`}>
            {proposalType.label}
          </span>
        )}
      </div>

      {/* Title + time */}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm text-dao-text font-medium truncate">{details.title}</h3>
        <p className="text-xs text-dao-text-hint mt-0.5">
          {formatTimeAgo(new Date(proposal.created_at).getTime())}
        </p>
      </div>

      {/* Vote column — bar + text aligned together */}
      <div className="hidden sm:block w-28 flex-shrink-0 text-right">
        {totalBalance > 0n ? (
          <>
            <div className="flex h-1.5 rounded-full bg-dao-dark-2 overflow-hidden mb-1">
              <div className="h-full bg-emerald-500" style={{ width: `${yesPercent}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${noPercent}%` }} />
            </div>
            <span className="text-[10px] text-dao-text-hint">
              {yesPercent}% yes · {proposal.yes_votes + proposal.no_votes} votes
            </span>
          </>
        ) : (
          <span className="text-[10px] text-dao-text-hint">No votes</span>
        )}
      </div>

      {/* Status */}
      <StatusBadge status={status} className="flex-shrink-0" />
    </Link>
  )
}

export function Proposals() {
  const { dao } = useOutletContext<DaoContext>()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const { data: proposals, isLoading, error } = useProposals(dao.id)

  const daoConfig = useMemo<DaoExpiryConfig>(() => ({
    voting_period: dao.voting_period,
    grace_period: dao.grace_period,
    default_expiry_window: dao.default_expiry_window,
  }), [dao.voting_period, dao.grace_period, dao.default_expiry_window])

  // Compute all proposals with status once, then filter
  const allWithStatus = useMemo(() => {
    if (!proposals) return [] as ProposalWithStatus[]
    return proposals.map((p) => ({ proposal: p, status: deriveProposalStatus(p, daoConfig) }))
  }, [proposals, daoConfig])

  const filteredProposals = useMemo(
    () => allWithStatus.filter((ps) => matchesFilter(ps, activeFilter)),
    [allWithStatus, activeFilter],
  )

  // Count per filter tab
  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: 0, voting: 0, grace: 0, ready: 0, passed: 0, failed: 0 }
    for (const ps of allWithStatus) {
      counts.all++
      if (ps.status === ProposalStatus.Voting) counts.voting++
      else if (ps.status === ProposalStatus.Grace) counts.grace++
      else if (ps.status === ProposalStatus.Ready) counts.ready++
      else if (ps.status === ProposalStatus.Processed && ps.proposal.passed) counts.passed++
      else if (ps.status === ProposalStatus.Defeated || ps.status === ProposalStatus.Cancelled || ps.status === ProposalStatus.Expired || ps.status === ProposalStatus.ActionFailed) counts.failed++
    }
    return counts
  }, [allWithStatus])

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: dao.name || `DAO ${dao.id.slice(0, 8)}...`, href: `/dao/${dao.id}` },
        { label: 'Proposals' },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-dao-text">Proposals</h1>
        <Link to="new">
          <Button variant="primary">New Proposal</Button>
        </Link>
      </div>

      {/* Filter tabs with count badges */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const count = tabCounts[tab.value]
          return (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeFilter === tab.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-dao-surface text-dao-text-muted hover:text-dao-text hover:bg-dao-border'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeFilter === tab.value
                    ? 'bg-white/20 text-white'
                    : 'bg-dao-dark-2 text-dao-text-hint'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Proposal list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => <SkeletonProposalCard key={i} />)}
        </div>
      ) : error ? (
        <EmptyState
          title="Failed to load proposals"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        />
      ) : filteredProposals.length > 0 ? (
        <Card>
          <div className="divide-y divide-dao-border">
            {filteredProposals.map(({ proposal, status }) => (
              <ProposalCard key={proposal.id} proposal={proposal} daoId={dao.id} status={status} />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title={activeFilter === 'all' ? 'No proposals yet' : `No ${activeFilter} proposals`}
          description={
            activeFilter === 'all'
              ? 'Be the first to create a proposal for this DAO.'
              : `There are no proposals with "${activeFilter}" status.`
          }
          action={
            activeFilter === 'all' ? (
              <Link to="new"><Button variant="primary">Create Proposal</Button></Link>
            ) : undefined
          }
        />
      )}
    </div>
  )
}

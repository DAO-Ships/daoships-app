import { useState, useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { Dao, Proposal } from '@/types'
import { ProposalStatus, deriveProposalStatus } from '@/types/proposal'
import { useProposals } from '@/hooks/useProposals'
import { safeBigInt } from '@/utils/bigint'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { EmptyState } from '@/components/common/EmptyState'
import { formatTimeAgo } from '@/utils/time'
import { parseProposalDetails } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// Proposals - Proposal list with status filter tabs
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

interface DaoExpiryConfig {
  voting_period: number
  grace_period: number
  default_expiry_window: number
}

function matchesFilter(proposal: Proposal, filter: FilterTab, daoConfig?: DaoExpiryConfig): boolean {
  if (filter === 'all') return true

  const status = deriveProposalStatus(proposal, daoConfig)
  switch (filter) {
    case 'voting':
      return status === ProposalStatus.Voting
    case 'grace':
      return status === ProposalStatus.Grace
    case 'ready':
      return status === ProposalStatus.Ready
    case 'passed':
      return status === ProposalStatus.Processed && proposal.passed
    case 'failed':
      return (
        status === ProposalStatus.Defeated ||
        status === ProposalStatus.Cancelled ||
        status === ProposalStatus.Expired
      )
    default:
      return true
  }
}

function ProposalCard({ proposal, daoId, daoConfig }: { proposal: Proposal; daoId: string; daoConfig?: DaoExpiryConfig }) {
  const status = deriveProposalStatus(proposal, daoConfig)
  const yesBalance = safeBigInt(proposal.yes_balance)
  const noBalance = safeBigInt(proposal.no_balance)
  const totalBalance = yesBalance + noBalance
  const yesPercent = totalBalance > 0n
    ? Number((yesBalance * 100n) / totalBalance)
    : 0

  return (
    <Link
      to={`/dao/${daoId}/proposals/${proposal.proposal_id}`}
      className="card block px-5 py-4 hover:border-accent-500/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-mono text-dao-text-hint">
              #{proposal.proposal_id}
            </span>
            <h3 className="text-dao-text font-medium truncate">
              {parseProposalDetails(proposal.details).title}
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs text-dao-text-hint mt-2">
            <span>{formatTimeAgo(new Date(proposal.created_at).getTime())}</span>
            {totalBalance > 0n && (
              <span>
                {yesPercent}% approval ({proposal.yes_votes} yes / {proposal.no_votes} no)
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
            status === ProposalStatus.Voting
              ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400'
              : status === ProposalStatus.Grace
                ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400'
                : status === ProposalStatus.Ready
                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                  : status === ProposalStatus.Processed
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500'
                    : status === ProposalStatus.Defeated ||
                        status === ProposalStatus.Cancelled
                      ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                      : status === ProposalStatus.Expired
                        ? 'bg-dao-surface text-dao-text-hint'
                        : 'bg-dao-surface text-dao-text-muted'
          }`}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>

      {/* Vote progress bar */}
      {totalBalance > 0n && (
        <div className="mt-3 h-1.5 rounded-full bg-dao-dark-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${yesPercent}%` }}
          />
        </div>
      )}
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

  const filteredProposals = useMemo(() => {
    if (!proposals) return []
    return proposals.filter((p) => matchesFilter(p, activeFilter, daoConfig))
  }, [proposals, activeFilter, daoConfig])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-hint">
        <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
          {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
        </Link>
        <span>/</span>
        <span className="text-dao-text-secondary">Proposals</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display text-dao-text">Proposals</h1>
        <Link to="new">
          <Button variant="primary">New Proposal</Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeFilter === tab.value
                ? 'bg-primary-600 text-white'
                : 'bg-dao-surface text-dao-text-muted hover:text-dao-text hover:bg-dao-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Proposal list */}
      {isLoading ? (
        <Loading fullPage />
      ) : error ? (
        <EmptyState
          title="Failed to load proposals"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        />
      ) : filteredProposals.length > 0 ? (
        <div className="space-y-3">
          {filteredProposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              daoId={dao.id}
              daoConfig={daoConfig}
            />
          ))}
        </div>
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
              <Link to="new">
                <Button variant="primary">Create Proposal</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  )
}

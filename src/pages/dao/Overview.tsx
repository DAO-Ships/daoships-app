import { Link, useOutletContext } from 'react-router-dom'
import type { Dao } from '@/types'
import { useProposals } from '@/hooks/useProposals'
import { useMembers } from '@/hooks/useMembers'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { useDaoProfile } from '@/hooks/useDaoProfile'
import { useDaoAnnouncements } from '@/hooks/useDaoAnnouncements'
import { DaoProfile } from '@/components/dao/DaoProfile'
import { DaoStats } from '@/components/dao/DaoStats'
import { AnnouncementBanner } from '@/components/dao/AnnouncementBanner'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { TokenAmount } from '@/components/common/TokenAmount'
import { formatTimeAgo } from '@/utils/time'
import { parseProposalDetails, formatTokenAmount } from '@/utils/format'
import { deriveProposalStatus } from '@/types/proposal'
import { NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// Overview - DAO dashboard with stats, profile, and recent proposals
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

export function Overview() {
  const { dao } = useOutletContext<DaoContext>()
  const { data: profileRecord } = useDaoProfile(dao.id)
  const { data: proposals, isLoading: proposalsLoading } = useProposals(dao.id)
  const daoConfig = { voting_period: dao.voting_period, grace_period: dao.grace_period, default_expiry_window: dao.default_expiry_window }
  const { data: members } = useMembers(dao.id)
  const { data: treasury } = useTreasury(dao.id)
  const { data: balances, isLoading: balancesLoading, error: balancesError } = useTreasuryBalances(dao.avatar, treasury)
  const { data: announcements } = useDaoAnnouncements(dao.id)

  const recentProposals = proposals?.slice(0, 5) ?? []
  const latestAnnouncement = announcements?.[0]
  const memberCount = members?.length ?? Number(dao.active_member_count || '0')
  const treasuryValue = balances
    ? `${formatTokenAmount(balances.nativeBalance)} QUAI`
    : undefined

  return (
    <div className="space-y-8">
      {/* Hero Banner — DAO identity + stats */}
      <section className="rounded-xl border border-dao-border bg-gradient-dao-radial shadow-dao-card overflow-hidden">
        <DaoProfile dao={dao} profile={profileRecord} />
        <DaoStats dao={dao} memberCount={memberCount} treasuryValue={treasuryValue} />
      </section>

      {/* Latest Announcement */}
      {latestAnnouncement && (
        <section>
          <AnnouncementBanner announcement={latestAnnouncement} />
        </section>
      )}

      {/* Treasury Summary */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-dao-text">Treasury</h2>
          <Link to="treasury">
            <Button variant="secondary" size="sm">
              View Details
            </Button>
          </Link>
        </div>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-1">Vault Balance</p>
              {balancesLoading ? (
                <span className="text-2xl font-bold font-display text-dao-text-hint">Loading...</span>
              ) : balancesError ? (
                <span className="text-sm text-red-400">Failed to load</span>
              ) : balances ? (
                <TokenAmount
                  amount={balances.nativeBalance}
                  symbol="QUAI"
                  className="text-2xl font-bold font-display text-dao-text"
                />
              ) : (
                <span className="text-2xl font-bold font-display text-dao-text-hint">--</span>
              )}
            </div>
            <a
              href={`${NETWORK_CONFIG.quaiVaultUrl}/wallet/${dao.avatar}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              Open in QuaiVault
            </a>
          </div>
          {balances && balances.tokenBalances.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dao-border flex flex-wrap gap-4">
              {balances.tokenBalances.map((token) => (
                <div key={token.address} className="text-sm">
                  <TokenAmount
                    amount={token.balance}
                    symbol={token.symbol}
                    decimals={token.decimals}
                    className="text-dao-text-secondary"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Recent Proposals */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-dao-text">Recent Proposals</h2>
          <div className="flex items-center gap-2">
            <Link to="proposals/new">
              <Button variant="primary" size="sm">
                New Proposal
              </Button>
            </Link>
            <Link to="proposals">
              <Button variant="secondary" size="sm">
                View All
              </Button>
            </Link>
          </div>
        </div>

        {proposalsLoading ? (
          <Loading fullPage />
        ) : recentProposals.length > 0 ? (
          <div className="space-y-3">
            {recentProposals.map((proposal) => {
              const status = deriveProposalStatus(proposal, daoConfig)
              return (
                <Link
                  key={proposal.id}
                  to={`proposals/${proposal.proposal_id}`}
                  className="card block px-5 py-4 hover:border-accent-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-dao-text-hint">
                          #{proposal.proposal_id}
                        </span>
                        <span className="text-dao-text font-medium truncate">
                          {parseProposalDetails(proposal.details).title}
                        </span>
                      </div>
                      <p className="text-xs text-dao-text-hint mt-1">
                        {formatTimeAgo(new Date(proposal.created_at).getTime())}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        status === 'voting'
                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400'
                          : status === 'grace'
                            ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400'
                            : status === 'ready'
                              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                              : status === 'processed'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500'
                                : status === 'defeated' || status === 'cancelled'
                                  ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                                  : 'bg-dao-surface text-dao-text-muted'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <Card>
            <p className="text-center text-dao-text-muted py-4">
              No proposals yet.{' '}
              <Link
                to="proposals/new"
                className="text-primary-400 hover:text-primary-300"
              >
                Create the first proposal
              </Link>
            </p>
          </Card>
        )}
      </section>

      {/* Member Summary */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-dao-text">Members</h2>
          <Link to="members">
            <Button variant="secondary" size="sm">
              View All
            </Button>
          </Link>
        </div>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-dao-text-secondary">
              <span className="text-2xl font-bold font-display text-dao-text mr-2">
                {memberCount}
              </span>
              active {memberCount === 1 ? 'member' : 'members'}
            </p>
            <Link to="members">
              <span className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
                View member list
              </span>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  )
}

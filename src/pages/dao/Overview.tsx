import { useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import type { Dao } from '@/types'
import { ProposalStatus, deriveProposalStatus } from '@/types/proposal'
import { useProposals } from '@/hooks/useProposals'
import { useMember } from '@/hooks/useMember'
import { useWallet } from '@/hooks/useWallet'
import { safeBigInt } from '@/utils/bigint'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { useDaoProfile } from '@/hooks/useDaoProfile'
import { useDaoAnnouncements } from '@/hooks/useDaoAnnouncements'
import { DaoProfile } from '@/components/dao/DaoProfile'
import { DaoStats } from '@/components/dao/DaoStats'
import { AnnouncementBanner } from '@/components/dao/AnnouncementBanner'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { SkeletonCard } from '@/components/common/Skeleton'
import { TokenAmount } from '@/components/common/TokenAmount'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatTokenAmount } from '@/utils/format'
import { formatTimeAgo } from '@/utils/time'
import { parseProposalDetails } from '@/utils/format'
import { getProposalType } from '@/utils/proposalTypes'
import { NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// Overview - DAO dashboard with two-column layout
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

export function Overview() {
  const { dao } = useOutletContext<DaoContext>()
  usePageTitle('Overview', dao.name)
  const { data: profileRecord } = useDaoProfile(dao.id)
  const { data: proposals, isLoading: proposalsLoading } = useProposals(dao.id)
  const daoConfig = { voting_period: dao.voting_period, grace_period: dao.grace_period, default_expiry_window: dao.default_expiry_window }
  const { address } = useWallet()
  const { data: announcements } = useDaoAnnouncements(dao.id)

  const { data: currentMember } = useMember(dao.id, address ?? undefined)
  const isMember = currentMember ? (safeBigInt(currentMember.shares) > 0n || safeBigInt(currentMember.loot) > 0n) : false
  const memberCount = Number(dao.active_member_count || '0')

  const { data: treasury } = useTreasury(dao.id)
  const { data: balances, isLoading: balancesLoading, error: balancesError } = useTreasuryBalances(dao.avatar, treasury)

  const recentProposals = proposals?.slice(0, 5) ?? []
  const latestAnnouncement = announcements?.[0]
  const treasuryValue = balances ? `${formatTokenAmount(balances.nativeBalance)} QUAI` : undefined

  // Count proposals needing the user's attention
  const actionableProposals = useMemo(() => {
    if (!proposals || !address) return { voting: 0, ready: 0 }
    let voting = 0
    let ready = 0
    for (const p of proposals) {
      const status = deriveProposalStatus(p, daoConfig)
      if (status === ProposalStatus.Voting) voting++
      if (status === ProposalStatus.Ready) ready++
    }
    return { voting, ready }
  }, [proposals, address, daoConfig])

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <section className="rounded-xl border border-dao-border bg-gradient-dao-radial shadow-dao-card overflow-hidden">
        <DaoProfile dao={dao} profile={profileRecord} isMember={isMember} />
        <DaoStats dao={dao} memberCount={memberCount} treasuryValue={treasuryValue} />
      </section>

      {/* Announcement */}
      {latestAnnouncement && (
        <section><AnnouncementBanner announcement={latestAnnouncement} /></section>
      )}

      {/* Quick Actions — only for connected members */}
      {isMember && (actionableProposals.voting > 0 || actionableProposals.ready > 0) && (
        <section className="flex flex-wrap gap-3">
          {actionableProposals.voting > 0 && (
            <Link to="proposals?filter=voting"
              className="flex-1 min-w-[200px] card px-4 py-3 hover:border-primary-500/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-primary-400">{actionableProposals.voting}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-dao-text">Proposals in Voting</p>
                  <p className="text-xs text-dao-text-hint">Cast your vote</p>
                </div>
              </div>
            </Link>
          )}
          {actionableProposals.ready > 0 && (
            <Link to="proposals?filter=ready"
              className="flex-1 min-w-[200px] card px-4 py-3 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-emerald-400">{actionableProposals.ready}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-dao-text">Ready to Process</p>
                  <p className="text-xs text-dao-text-hint">Execute approved proposals</p>
                </div>
              </div>
            </Link>
          )}
        </section>
      )}

      {/* ══ Two-column: Treasury + Recent Proposals ══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Treasury Summary */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-dao-text">Treasury</h2>
            <Link to="treasury"><Button variant="secondary" size="sm">View Details</Button></Link>
          </div>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-1">Vault Balance</p>
                {balancesLoading ? (
                  <span className="text-2xl font-bold font-display text-dao-text-hint">--</span>
                ) : balancesError ? (
                  <span className="text-sm text-red-400">Failed to load</span>
                ) : balances ? (
                  <TokenAmount amount={balances.nativeBalance} symbol="QUAI"
                    className="text-2xl font-bold font-display text-dao-text" />
                ) : (
                  <span className="text-2xl font-bold font-display text-dao-text-hint">--</span>
                )}
              </div>
              <a href={`${NETWORK_CONFIG.quaiVaultUrl}/wallet/${dao.avatar}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
                QuaiVault
              </a>
            </div>
            {balances && balances.tokenBalances.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dao-border flex flex-wrap gap-4">
                {balances.tokenBalances.map((token) => (
                  <div key={token.address} className="text-sm">
                    <TokenAmount amount={token.balance} symbol={token.symbol}
                      decimals={token.decimals} className="text-dao-text-secondary" />
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
              <Link to="proposals/new"><Button variant="primary" size="sm">New</Button></Link>
              <Link to="proposals"><Button variant="secondary" size="sm">View All</Button></Link>
            </div>
          </div>

          {proposalsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} lines={2} />)}
            </div>
          ) : recentProposals.length > 0 ? (
            <Card>
              <div className="divide-y divide-dao-border">
                {recentProposals.map((proposal) => {
                  const status = deriveProposalStatus(proposal, daoConfig)
                  const proposalType = getProposalType(proposal.details, proposal.proposal_data)
                  return (
                    <Link key={proposal.id} to={`proposals/${proposal.proposal_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-dao-surface/50 transition-colors">
                      <span className="text-xs font-mono text-dao-text-hint w-7 flex-shrink-0">#{proposal.proposal_id}</span>
                      {proposalType && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${proposalType.color}`}>
                          {proposalType.label}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-dao-text font-medium truncate block">
                          {parseProposalDetails(proposal.details).title}
                        </span>
                        <p className="text-xs text-dao-text-hint mt-0.5">
                          {formatTimeAgo(new Date(proposal.created_at).getTime())}
                        </p>
                      </div>
                      <StatusBadge status={status} />
                    </Link>
                  )
                })}
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-center text-dao-text-muted py-4">
                No proposals yet.{' '}
                <Link to="proposals/new" className="text-primary-400 hover:text-primary-300">
                  Create the first proposal
                </Link>
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

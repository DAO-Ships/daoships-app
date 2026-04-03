import { useState, useEffect } from 'react'
import { ProposalStatus } from '@/types/proposal'
import type { Proposal, DaoExpiryConfig, Vote } from '@/types'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { ProposalActions } from './ProposalActions'
import { safeBigInt } from '@/utils/bigint'
import { formatCountdown } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// VotingSidebar — Combines voting progress, countdown, and actions
// ═══════════════════════════════════════════════════════════════════════════

interface VotingSidebarProps {
  proposal: Proposal
  dao: { quorum_percent: string; sponsor_threshold: string }
  status: string
  daoId: string
  daoConfig?: DaoExpiryConfig
  // User context
  connected: boolean
  userAddress: string | null
  userShares: bigint
  hasVoted: boolean
  delegatingTo: string | null
  delegateVote: Vote | null
  delegateVoteReason: string | null
  delegateProfile: MemberProfile | null
  sponsorBelowThreshold: boolean
  // Action callbacks
  onSponsor: () => void
  onVote: (approved: boolean) => void
  onProcess: () => void
  onCancel: () => void
  onConnect: () => void
  proposalDataMissing: boolean
  isSponsorPending: boolean
  isVotePending: boolean
  isProcessPending: boolean
  isCancelPending: boolean
  // Errors
  actionErrors: (Error | string | null | undefined)[]
}

export function VotingSidebar({
  proposal, dao, status, daoId, daoConfig,
  connected, userAddress, userShares, hasVoted,
  delegatingTo, delegateVote, delegateVoteReason, delegateProfile,
  sponsorBelowThreshold,
  onSponsor, onVote, onProcess, onCancel, onConnect,
  proposalDataMissing,
  isSponsorPending, isVotePending, isProcessPending, isCancelPending,
  actionErrors,
}: VotingSidebarProps) {
  const yesBalance = safeBigInt(proposal.yes_balance)
  const noBalance = safeBigInt(proposal.no_balance)
  const totalBalance = yesBalance + noBalance
  const yesPercent = totalBalance > 0n ? Number((yesBalance * 100n) / totalBalance) : 0
  const noPercent = totalBalance > 0n ? 100 - yesPercent : 0

  const isTerminal = [ProposalStatus.Processed, ProposalStatus.Defeated, ProposalStatus.ActionFailed, ProposalStatus.Cancelled, ProposalStatus.Expired].includes(status as ProposalStatus)

  // Countdown tick — isolated here so only sidebar re-renders
  const [, setTick] = useState(0)
  const isCountdownActive = status === ProposalStatus.Voting || status === ProposalStatus.Grace
  useEffect(() => {
    if (!isCountdownActive) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isCountdownActive])

  return (
    <div className={`card px-5 py-4 space-y-4 ${isTerminal ? 'opacity-75' : ''}`}>
      {/* Voting Progress — compact in sidebar, detail view */}
      <div>
        <h3 className="text-xs font-semibold text-dao-text-hint uppercase tracking-wider mb-2">Vote Breakdown</h3>
        <div className="space-y-2">
          {/* Yes */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-emerald-400">Yes</span>
              <span className="text-dao-text-muted">{proposal.yes_votes} ({yesPercent}%)</span>
            </div>
            <div className="h-2 rounded-full bg-dao-dark-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${isTerminal ? 'bg-emerald-500/50' : 'bg-emerald-500'}`}
                style={{ width: `${yesPercent}%` }} />
            </div>
          </div>

          {/* No */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-red-400">No</span>
              <span className="text-dao-text-muted">{proposal.no_votes} ({noPercent}%)</span>
            </div>
            <div className="h-2 rounded-full bg-dao-dark-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${isTerminal ? 'bg-red-500/50' : 'bg-red-500'}`}
                style={{ width: `${noPercent}%` }} />
            </div>
          </div>

          {/* Quorum */}
          {(() => {
            const quorumBps = Number(dao.quorum_percent)
            const quorumPct = quorumBps / 100
            const maxShares = safeBigInt(proposal.max_total_shares_and_loot_at_vote)
            const quorumThreshold = maxShares > 0n ? (maxShares * BigInt(quorumBps)) / 10000n : 0n
            const participation = yesBalance + noBalance
            const quorumMet = quorumThreshold > 0n && participation >= quorumThreshold
            const participationPct = quorumThreshold > 0n ? Math.min(100, Number((participation * 100n) / quorumThreshold)) : 0

            if (quorumBps === 0) return <p className="text-xs text-dao-text-hint">No quorum requirement</p>

            return (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-dao-text-muted">Quorum ({quorumPct.toFixed(1)}%)</span>
                  <span className={quorumMet ? 'text-emerald-400' : 'text-dao-text-muted'}>
                    {quorumMet ? 'Reached' : `${participationPct.toFixed(0)}%`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-dao-dark-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${quorumMet ? 'bg-emerald-500' : 'bg-primary-500/60'}`}
                    style={{ width: `${participationPct}%` }} />
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Countdown / Timeline */}
      {!isTerminal && (
        <div className="border-t border-dao-border pt-3">
          <h3 className="text-xs font-semibold text-dao-text-hint uppercase tracking-wider mb-2">Timeline</h3>
          <div className="space-y-2 text-xs">
            {proposal.voting_ends && (
              <div className="flex items-center justify-between">
                <span className="text-dao-text-muted">
                  {status === ProposalStatus.Voting ? 'Voting ends' : 'Voting ended'}
                </span>
                <span className="text-dao-text-secondary font-mono">
                  {status === ProposalStatus.Voting
                    ? formatCountdown(new Date(proposal.voting_ends).getTime())
                    : new Date(proposal.voting_ends).toLocaleDateString()}
                </span>
              </div>
            )}
            {proposal.grace_ends && (
              <div className="flex items-center justify-between">
                <span className="text-dao-text-muted">
                  {new Date(proposal.grace_ends).getTime() > Date.now() ? 'Grace ends' : 'Grace ended'}
                </span>
                <span className="text-dao-text-secondary font-mono">
                  {status === ProposalStatus.Grace
                    ? formatCountdown(new Date(proposal.grace_ends).getTime())
                    : new Date(proposal.grace_ends).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-dao-border pt-3">
        {connected ? (
          <ProposalActions
            proposal={proposal}
            daoId={daoId}
            daoConfig={daoConfig}
            userAddress={userAddress}
            userShares={userShares}
            sponsorThreshold={safeBigInt(dao.sponsor_threshold)}
            hasVoted={hasVoted}
            delegatingTo={delegatingTo}
            delegateVote={delegateVote}
            delegateVoteReason={delegateVoteReason}
            delegateProfile={delegateProfile}
            onSponsor={onSponsor}
            onVote={onVote}
            onProcess={onProcess}
            onCancel={onCancel}
            proposalDataMissing={proposalDataMissing}
            isSponsorPending={isSponsorPending}
            isVotePending={isVotePending}
            isProcessPending={isProcessPending}
            isCancelPending={isCancelPending}
            sponsorBelowThreshold={sponsorBelowThreshold}
          />
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 transition-colors"
          >
            Connect Wallet to Participate
          </button>
        )}
      </div>

      {/* Action errors */}
      {actionErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg px-3 py-2">
          {actionErrors.map((err, i) => (
            <p key={i} className="text-xs text-red-400">
              {err instanceof Error ? err.message : 'Action failed'}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

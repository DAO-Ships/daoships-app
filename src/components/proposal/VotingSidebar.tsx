import { useState, useEffect, memo } from 'react'
import { ProposalStatus, getProposalExpiry, quorumStatus } from '@/types/proposal'
import type { Proposal, DaoExpiryConfig, Vote } from '@/types'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { ProposalActions } from './ProposalActions'
import { safeBigInt } from '@/utils/bigint'
import { classifyTxError } from '@/utils/txError'
import { formatCountdown, formatIndexerDate } from '@/utils/time'

// ═══════════════════════════════════════════════════════════════════════════
// VotingSidebar — Combines voting progress, countdown, and actions
// ═══════════════════════════════════════════════════════════════════════════

interface VotingSidebarProps {
  proposal: Proposal
  dao: { quorum_percent: string; sponsor_threshold: string; total_shares: string }
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
  priorVotes?: bigint
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

export const VotingSidebar = memo(function VotingSidebar({
  proposal, dao, status, daoId, daoConfig,
  connected, userAddress, userShares, hasVoted,
  delegatingTo, delegateVote, delegateVoteReason, delegateProfile, priorVotes,
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

  // Effective expiry (explicit proposal expiration, or the DAO's auto-expiry window).
  const expiryMs = getProposalExpiry(proposal, daoConfig)
  const expiryInFuture = expiryMs !== null && expiryMs > Date.now()

  // Countdown tick — isolated here so only sidebar re-renders. Runs during voting/grace
  // and also while an expiry is still counting down (e.g. a Ready proposal nearing auto-expiry).
  const [, setTick] = useState(0)
  const isCountdownActive = status === ProposalStatus.Voting || status === ProposalStatus.Grace || expiryInFuture
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
            // Single source of truth, shared with willProposalPass. This block used to
            // compute its own formula — yes+no participation against the shares+loot
            // at-vote high-water mark — while the contract measures yes-only against the
            // SHARES-ONLY sponsor snapshot. In a loot-heavy DAO that rendered a green
            // "Quorum: Reached" on a proposal the contract had already defeated.
            const q = quorumStatus(proposal, dao.quorum_percent)

            if (q === null) {
              return (
                <p className="text-xs text-dao-text-hint">
                  Quorum unavailable — the sponsor snapshot has not been indexed yet.
                </p>
              )
            }
            if (!q.required) {
              return <p className="text-xs text-dao-text-hint">No quorum requirement</p>
            }

            const quorumPct = Number(q.quorumBps) / 100
            return (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-dao-text-muted">Quorum ({quorumPct.toFixed(1)}%)</span>
                  <span className={q.met ? 'text-emerald-400' : 'text-dao-text-muted'}>
                    {q.met ? 'Reached' : `${q.progressPct.toFixed(0)}%`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-dao-dark-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${q.met ? 'bg-emerald-500' : 'bg-primary-500/60'}`}
                    style={{ width: `${q.progressPct}%` }} />
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
                    : formatIndexerDate(proposal.voting_ends)}
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
                    : formatIndexerDate(proposal.grace_ends)}
                </span>
              </div>
            )}
            {expiryMs !== null && (
              <div className="flex items-center justify-between">
                <span
                  className="text-dao-text-muted"
                  title={
                    proposal.expiration
                      ? 'This proposal can no longer be sponsored or processed after this time.'
                      : 'Auto-expiry: a passed proposal not processed by this time can no longer be executed.'
                  }
                >
                  {expiryInFuture ? 'Expires' : 'Expired'}
                </span>
                <span className={`font-mono ${expiryInFuture ? 'text-dao-text-secondary' : 'text-red-400'}`}>
                  {expiryInFuture
                    ? formatCountdown(expiryMs)
                    : new Date(expiryMs).toLocaleDateString()}
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
            sponsorThreshold={(() => {
              // Mirrors DAOShip._effectiveSponsorThreshold(): min(sponsorThreshold,
              // sharesTotalSupply). Comparing the RAW threshold meant that after a mass
              // ragequit (or when shares were minted after governance setup) the Sponsor
              // button was hidden for everyone and no proposal could be sponsored at all.
              const raw = safeBigInt(dao.sponsor_threshold)
              const supply = safeBigInt(dao.total_shares)
              return raw > supply ? supply : raw
            })()}
            hasVoted={hasVoted}
            delegatingTo={delegatingTo}
            delegateVote={delegateVote}
            delegateVoteReason={delegateVoteReason}
            delegateProfile={delegateProfile}
            priorVotes={priorVotes}
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

      {/* Action outcomes — a pending-confirmation timeout is framed as "still confirming",
          not a failure, since the transaction was broadcast and the indexer will catch up. */}
      {actionErrors.length > 0 && (
        <div className="space-y-2">
          {actionErrors.map((err, i) => {
            const info = classifyTxError(err)
            return info.pending ? (
              <div
                key={i}
                className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-3 py-2"
              >
                <p className="text-xs font-medium text-amber-500">{info.title}</p>
                <p className="text-xs text-amber-400/90">{info.message}</p>
              </div>
            ) : (
              <div
                key={i}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg px-3 py-2"
              >
                <p className="text-xs text-red-400">{info.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

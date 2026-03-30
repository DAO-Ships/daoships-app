import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useOutletContext, Link } from 'react-router-dom'
import type { Dao } from '@/types'
import { ProposalStatus } from '@/types/proposal'
import { useProposal } from '@/hooks/useProposal'
import { useProposalStatus } from '@/hooks/useProposalStatus'
import { useVoting } from '@/hooks/useVoting'
import { useProposalActions } from '@/hooks/useProposalActions'
import { useMember } from '@/hooks/useMember'
import { useWallet } from '@/hooks/useWallet'
import { useHasVoted } from '@/hooks/useHasVoted'
import { useVoteReasons } from '@/hooks/useVoteReasons'
import { useRealtimeProposal } from '@/hooks/useRealtimeProposal'
import { useRealtimeVotes } from '@/hooks/useRealtimeVotes'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { Modal } from '@/components/common/Modal'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { ProposalActions } from '@/components/proposal/ProposalActions'
import { ProposalActionSummary } from '@/components/proposal/ProposalActionSummary'
import { posterService } from '@/services/core/PosterService'
import { formatTimeAgo, formatCountdown } from '@/utils/time'
import { parseProposalDetails } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalDetail - Full proposal view with voting and timeline
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

const STATUS_STYLES: Record<string, string> = {
  [ProposalStatus.Submitted]: 'bg-dao-surface text-dao-text-muted',
  [ProposalStatus.Voting]: 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400',
  [ProposalStatus.Grace]: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  [ProposalStatus.Ready]: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
  [ProposalStatus.Processed]: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500',
  [ProposalStatus.Cancelled]: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  [ProposalStatus.Defeated]: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  [ProposalStatus.Expired]: 'bg-dao-surface text-dao-text-hint',
}

export function ProposalDetail() {
  const { daoId, proposalId } = useParams()
  const { dao } = useOutletContext<DaoContext>()
  const { data: proposal, isLoading, error } = useProposal(daoId, proposalId)
  const daoConfig = useMemo(() => ({
    voting_period: dao.voting_period,
    grace_period: dao.grace_period,
    default_expiry_window: dao.default_expiry_window,
  }), [dao.voting_period, dao.grace_period, dao.default_expiry_window])
  const status = useProposalStatus(proposal, daoConfig)
  const { connected, address } = useWallet()
  const { vote, isVoting, error: voteError } = useVoting(daoId!, proposalId!)
  const actions = useProposalActions(daoId!, proposalId!)
  const { data: member } = useMember(daoId, address ?? undefined)
  const { data: hasVoted = false } = useHasVoted(daoId, proposalId ? Number(proposalId) : undefined, address ?? undefined)

  // Tick every second during active countdown phases so formatCountdown re-renders
  const [, setTick] = useState(0)
  const isCountdownActive = status === ProposalStatus.Voting || status === ProposalStatus.Grace
  useEffect(() => {
    if (!isCountdownActive) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isCountdownActive])

  // Vote reasons
  const { data: voteReasons } = useVoteReasons(daoId, proposalId ? Number(proposalId) : undefined)
  const [showVoteReasonModal, setShowVoteReasonModal] = useState(false)
  const [voteReasonText, setVoteReasonText] = useState('')
  const [lastVoteDirection, setLastVoteDirection] = useState<boolean | null>(null)
  const [isPostingReason, setIsPostingReason] = useState(false)

  const handleVote = useCallback(async (approved: boolean) => {
    await vote(approved)
    setLastVoteDirection(approved)
    setShowVoteReasonModal(true)
  }, [vote])

  const handlePostVoteReason = useCallback(async () => {
    if (!voteReasonText.trim() || !daoId) return
    setIsPostingReason(true)
    try {
      await posterService.postVoteReason({
        daoAddress: daoId.toLowerCase(),
        proposalId: Number(proposalId),
        vote: lastVoteDirection ?? undefined,
        reason: voteReasonText.trim(),
      })
    } catch (err) {
      console.warn('[ProposalDetail] Failed to post vote reason:', err)
    } finally {
      setIsPostingReason(false)
      setShowVoteReasonModal(false)
      setVoteReasonText('')
    }
  }, [voteReasonText, daoId, proposalId, lastVoteDirection])

  // Realtime subscriptions for live updates
  useRealtimeProposal(daoId, proposalId)
  useRealtimeVotes(daoId, proposalId)

  const details = useMemo(
    () => proposal ? parseProposalDetails(proposal.details) : { title: '', description: '' },
    [proposal],
  )

  if (isLoading) {
    return <Loading fullPage />
  }

  if (error || !proposal) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-dao-text-secondary mb-2">
          Proposal not found
        </h2>
        <p className="text-dao-text-muted mb-6">
          {error instanceof Error ? error.message : 'This proposal does not exist.'}
        </p>
        <Link to={`/dao/${daoId}/proposals`}>
          <Button variant="secondary">Back to Proposals</Button>
        </Link>
      </div>
    )
  }

  const yesBalance = safeBigInt(proposal.yes_balance)
  const noBalance = safeBigInt(proposal.no_balance)
  const totalBalance = yesBalance + noBalance
  const yesPercent =
    totalBalance > 0n
      ? Number((yesBalance * 100n) / totalBalance)
      : 0
  const noPercent = totalBalance > 0n ? 100 - yesPercent : 0

  // Collect all action errors for display
  const actionErrors = [
    voteError,
    actions.sponsorError,
    actions.processError,
    actions.cancelError,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-muted">
        <Link
          to={`/dao/${daoId}`}
          className="hover:text-dao-text transition-colors"
        >
          {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
        </Link>
        <span className="text-dao-text-hint">/</span>
        <Link
          to={`/dao/${daoId}/proposals`}
          className="hover:text-dao-text transition-colors"
        >
          Proposals
        </Link>
        <span className="text-dao-text-hint">/</span>
        <span className="text-dao-text-hint">#{proposal.proposal_id}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-dao-text-hint">#{proposal.proposal_id}</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || 'bg-dao-surface text-dao-text-muted'}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
          <h1 className="text-2xl font-bold font-display text-dao-text">
            {details.title}
          </h1>
          {details.description && (
            <p className="text-dao-text-muted mt-2 max-w-3xl">
              {details.description}
            </p>
          )}
          {details.discussionUrl && (
            <a
              href={details.discussionUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 transition-colors mt-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Discussion
            </a>
          )}
        </div>
      </div>

      {/* Proposal metadata */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint mb-1">Created by</p>
            <AddressDisplay address={proposal.submitter} />
          </div>
          <div>
            <p className="text-dao-text-hint mb-1">Submitted</p>
            <p className="text-dao-text-secondary">
              {formatTimeAgo(new Date(proposal.created_at).getTime())}
            </p>
          </div>
          {proposal.sponsored && proposal.sponsor && (
            <div>
              <p className="text-dao-text-hint mb-1">Sponsored by</p>
              <AddressDisplay address={proposal.sponsor} />
            </div>
          )}
          {proposal.proposal_offering && safeBigInt(proposal.proposal_offering) > 0n && (
            <div>
              <p className="text-dao-text-hint mb-1">Proposal Offering</p>
              <TokenAmount amount={proposal.proposal_offering} symbol="QUAI" />
            </div>
          )}
        </div>
      </Card>

      {/* Proposed Actions */}
      <ProposalActionSummary proposalData={proposal.proposal_data} />

      {/* Voting Progress */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Voting Progress</h2>}>
        <div className="space-y-4">
          {/* Yes votes */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-emerald-400">Yes</span>
              <span className="text-dao-text-muted">
                {proposal.yes_votes} votes ({yesPercent}%)
              </span>
            </div>
            <div className="h-3 rounded-full bg-dao-dark-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${yesPercent}%` }}
              />
            </div>
          </div>

          {/* No votes */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-red-400">No</span>
              <span className="text-dao-text-muted">
                {proposal.no_votes} votes ({noPercent}%)
              </span>
            </div>
            <div className="h-3 rounded-full bg-dao-dark-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500 transition-all duration-500"
                style={{ width: `${noPercent}%` }}
              />
            </div>
          </div>

          {/* Quorum info */}
          <p className="text-xs text-dao-text-hint">
            Quorum: {dao.quorum_percent}% required
          </p>
        </div>
      </Card>

      {/* Timeline */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Timeline</h2>}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-dao-text-muted">Submitted</span>
            <span className="text-dao-text-secondary">
              {new Date(proposal.created_at).toLocaleString()}
            </span>
          </div>
          {proposal.voting_starts && (
            <div className="flex items-center justify-between">
              <span className="text-dao-text-muted">Voting started</span>
              <span className="text-dao-text-secondary">
                {new Date(proposal.voting_starts).toLocaleString()}
              </span>
            </div>
          )}
          {proposal.voting_ends && (
            <div className="flex items-center justify-between">
              <span className="text-dao-text-muted">
                {status === ProposalStatus.Voting ? 'Voting ends' : 'Voting ended'}
              </span>
              <span className="text-dao-text-secondary">
                {status === ProposalStatus.Voting
                  ? formatCountdown(new Date(proposal.voting_ends).getTime())
                  : new Date(proposal.voting_ends).toLocaleString()}
              </span>
            </div>
          )}
          {proposal.grace_ends && (
            <div className="flex items-center justify-between">
              <span className="text-dao-text-muted">
                {status === ProposalStatus.Grace ? 'Grace ends' : 'Grace ended'}
              </span>
              <span className="text-dao-text-secondary">
                {status === ProposalStatus.Grace
                  ? formatCountdown(new Date(proposal.grace_ends).getTime())
                  : new Date(proposal.grace_ends).toLocaleString()}
              </span>
            </div>
          )}
          {proposal.processed && proposal.process_tx_at && (
            <div className="flex items-center justify-between">
              <span className="text-dao-text-muted">Processed</span>
              <span className="text-dao-text-secondary">
                {new Date(proposal.process_tx_at).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Actions (sponsor, vote, process, cancel) */}
      {connected && (
        <ProposalActions
          proposal={proposal}
          daoId={daoId!}
          daoConfig={daoConfig}
          userAddress={address}
          userShares={member ? safeBigInt(member.voting_power) : 0n}
          sponsorThreshold={safeBigInt(dao.sponsor_threshold)}
          hasVoted={hasVoted}
          onSponsor={() => actions.sponsor()}
          onVote={(approved) => handleVote(approved)}
          onProcess={() => {
            if (!proposal.proposal_data) {
              console.warn('[ProposalDetail] proposal_data is missing — passing 0x which only works for signal proposals')
            }
            actions.process(proposal.proposal_data ?? '0x')
          }}
          proposalDataMissing={!proposal.proposal_data}
          onCancel={() => actions.cancel()}
          isSponsorPending={actions.isSponsorPending}
          isVotePending={isVoting}
          isProcessPending={actions.isProcessPending}
          isCancelPending={actions.isCancelPending}
        />
      )}

      {/* Error display for any action failures */}
      {actionErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl px-4 py-3">
          {actionErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-400">
              {err instanceof Error ? err.message : 'Action failed'}
            </p>
          ))}
        </div>
      )}

      {/* Vote Reasons */}
      <Card header={<h2 className="text-lg font-semibold text-dao-text">Vote Reasons</h2>}>
        {voteReasons && voteReasons.length > 0 ? (
          <div className="divide-y divide-dao-border">
            {voteReasons.map((reason, i) => (
              <div key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <AddressDisplay address={reason.voterAddress} showExplorer={false} />
                  {reason.vote !== undefined && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      reason.vote
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {reason.vote ? 'Yes' : 'No'}
                    </span>
                  )}
                  <span className="text-xs text-dao-text-hint ml-auto">
                    {formatTimeAgo(new Date(reason.createdAt).getTime())}
                  </span>
                </div>
                <p className="text-sm text-dao-text-secondary whitespace-pre-wrap">{reason.reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-dao-text-hint text-center py-4">
            No vote reasons submitted yet.
          </p>
        )}
      </Card>

      {/* Vote Reason Modal */}
      <Modal
        isOpen={showVoteReasonModal}
        onClose={() => { setShowVoteReasonModal(false); setVoteReasonText('') }}
        title="Share Your Reasoning"
      >
        <div className="space-y-4">
          <p className="text-sm text-dao-text-muted">
            Your vote has been submitted. Would you like to share why you voted{' '}
            <span className={lastVoteDirection ? 'text-emerald-400' : 'text-red-400'}>
              {lastVoteDirection ? 'yes' : 'no'}
            </span>
            ? This will be posted on-chain and is permanent.
          </p>
          <textarea
            value={voteReasonText}
            onChange={(e) => setVoteReasonText(e.target.value)}
            placeholder="Share your reasoning (optional)..."
            maxLength={2000}
            rows={4}
            className="input w-full resize-none"
          />
          <p className="text-xs text-dao-text-hint text-right">
            {voteReasonText.length}/2000
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handlePostVoteReason}
              loading={isPostingReason}
              disabled={!voteReasonText.trim() || isPostingReason}
            >
              Post Reason
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setShowVoteReasonModal(false); setVoteReasonText('') }}
            >
              Skip
            </Button>
          </div>
        </div>
      </Modal>

      {/* Result banner for completed proposals */}
      {(status === ProposalStatus.Processed || status === ProposalStatus.Defeated) && (
        <div
          className={`rounded-xl px-6 py-4 border ${
            proposal.passed
              ? 'bg-emerald-900/20 border-emerald-700/50'
              : 'bg-red-900/20 border-red-700/50'
          }`}
        >
          <p className={`font-semibold ${proposal.passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {proposal.passed
              ? 'Proposal Passed'
              : proposal.action_failed
                ? 'Proposal Passed but Action Failed'
                : 'Proposal Defeated'}
          </p>
        </div>
      )}
    </div>
  )
}

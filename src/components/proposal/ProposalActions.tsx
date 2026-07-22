import { useProposalStatus } from '@/hooks/useProposalStatus'
import { ProposalStatus } from '@/types'
import type { Proposal, Vote, DaoExpiryConfig } from '@/types'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { MemberAvatar } from '@/components/member/MemberAvatar'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalActions - Context-aware action buttons based on proposal status
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalActionsProps {
  proposal: Proposal
  daoId: string
  daoConfig?: DaoExpiryConfig
  userAddress?: string | null
  userShares?: bigint
  sponsorThreshold?: bigint
  hasVoted?: boolean
  /** Address the user has delegated their voting power to (null = self-delegated) */
  delegatingTo?: string | null
  /** The delegate's vote on this proposal, if they have voted */
  delegateVote?: Vote | null
  /** Vote reason posted by the delegate, if any */
  delegateVoteReason?: string | null
  /** Profile of the delegate, if available */
  delegateProfile?: MemberProfile | null
  /**
   * Voting power at the proposal's votingStarts snapshot. undefined = not yet
   * resolved (do not block on it); 0n = confirmed no power, so the contract would
   * reject the vote.
   */
  priorVotes?: bigint
  onSponsor?: () => void
  onVote?: (approved: boolean) => void
  onProcess?: () => void
  onCancel?: () => void
  proposalDataMissing?: boolean
  isSponsorPending?: boolean
  isVotePending?: boolean
  isProcessPending?: boolean
  isCancelPending?: boolean
  /** True when the sponsor's voting power has fallen below the sponsor threshold */
  sponsorBelowThreshold?: boolean
}

export function ProposalActions({
  proposal,
  daoId: _daoId,
  daoConfig,
  userAddress,
  userShares = 0n,
  sponsorThreshold = 0n,
  hasVoted = false,
  delegatingTo,
  delegateVote,
  delegateVoteReason,
  delegateProfile,
  priorVotes,
  onSponsor,
  onVote,
  onProcess,
  onCancel,
  proposalDataMissing = false,
  isSponsorPending = false,
  isVotePending = false,
  isProcessPending = false,
  isCancelPending = false,
  sponsorBelowThreshold = false,
}: ProposalActionsProps) {
  const status = useProposalStatus(proposal, daoConfig)

  if (!userAddress) {
    return (
      <div className="card px-6 py-4">
        <p className="text-sm text-dao-text-muted text-center">
          Connect your wallet to interact with this proposal
        </p>
      </div>
    )
  }

  // Check if user has delegated their voting power to someone else
  const hasDelegated = delegatingTo && delegatingTo.toLowerCase() !== userAddress.toLowerCase()

  const isProposer = userAddress.toLowerCase() === proposal.submitter?.toLowerCase()
  const isExpired = status === ProposalStatus.Expired
  const canSponsor = status === ProposalStatus.Submitted && userShares >= sponsorThreshold
  // The contract requires getPriorVotes(msg.sender, prop.votingStarts) != 0
  // (DAOShip.submitVote). Without this, members onboarded mid-vote and zero-share
  // wallets saw an enabled Vote button that reverts at gas estimation.
  // undefined means "not resolved yet" — do not block on a pending or failed read.
  const hasNoSnapshotPower = priorVotes !== undefined && priorVotes === 0n
  const canVote = status === ProposalStatus.Voting && !hasVoted && !hasDelegated
    && !hasNoSnapshotPower
  const canProcess = status === ProposalStatus.Ready
  const isCancellableStatus = status === ProposalStatus.Submitted || status === ProposalStatus.Voting
  const canCancelAsProposer = isProposer && isCancellableStatus
  const canCancelSponsorBelow = sponsorBelowThreshold && isCancellableStatus && !isProposer
  const canCancel = canCancelAsProposer || canCancelSponsorBelow

  const showVotedMessage = status === ProposalStatus.Voting && hasVoted
  // Explain the disabled Vote button rather than leaving it silently absent.
  const showNoSnapshotPower = status === ProposalStatus.Voting && !hasVoted
    && !hasDelegated && hasNoSnapshotPower
  const showDelegationInfo = status === ProposalStatus.Voting && hasDelegated
  const hasActions = canSponsor || canVote || canProcess || canCancel || showVotedMessage
    || showDelegationInfo || isExpired || sponsorBelowThreshold || showNoSnapshotPower

  if (!hasActions) {
    return null
  }

  return (
    <div className="card px-6 py-4">
      <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
        Actions
      </h3>
      <div className="flex flex-wrap gap-3">
        {/* Sponsor button */}
        {canSponsor && onSponsor && (
          <Button
            variant="primary"
            size="md"
            loading={isSponsorPending}
            onClick={onSponsor}
          >
            Sponsor Proposal
          </Button>
        )}

        {/* Vote buttons */}
        {showNoSnapshotPower && (
          <div className="bg-dao-surface/60 border border-dao-border rounded-lg px-4 py-3">
            <p className="text-sm text-dao-text-secondary font-medium">
              You had no voting power when this vote opened.
            </p>
            <p className="text-xs text-dao-text-muted mt-0.5">
              Voting power is snapshotted at the moment voting starts, so shares received
              after that do not count for this proposal.
            </p>
          </div>
        )}
        {canVote && onVote && (
          <>
            <Button
              variant="primary"
              size="md"
              loading={isVotePending}
              onClick={() => onVote(true)}
              className="bg-emerald-600 hover:bg-emerald-700 border-emerald-500"
            >
              Vote Yes
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={isVotePending}
              onClick={() => onVote(false)}
            >
              Vote No
            </Button>
          </>
        )}

        {/* Already voted indicator */}
        {status === ProposalStatus.Voting && hasVoted && !hasDelegated && (
          <span className="text-sm text-dao-text-muted self-center">You have already voted on this proposal.</span>
        )}

        {/* Delegation info — shown instead of vote buttons when user has delegated */}
        {showDelegationInfo && delegatingTo && (
          <div className="w-full bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/30 rounded-lg px-4 py-3 space-y-3">
            <p className="text-sm text-dao-text-secondary">
              Your voting power is delegated to:
            </p>
            <div className="flex items-center gap-3">
              <MemberAvatar avatar={delegateProfile?.avatar} size={8} />
              <div className="min-w-0">
                {delegateProfile?.name && (
                  <p className="text-sm font-medium text-dao-text">{delegateProfile.name}</p>
                )}
                <AddressDisplay address={delegatingTo} />
              </div>
            </div>
            {delegateProfile?.bio && (
              <p className="text-xs text-dao-text-muted line-clamp-2">{delegateProfile.bio}</p>
            )}
            {delegateVote ? (
              <div className="pt-1 border-t border-primary-200/50 dark:border-primary-700/20">
                <p className="text-sm">
                  Your delegate voted{' '}
                  <span className={`font-semibold ${delegateVote.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                    {delegateVote.approved ? 'Yes' : 'No'}
                  </span>
                </p>
                {delegateVoteReason && (
                  <p className="text-sm text-dao-text-muted mt-1 whitespace-pre-wrap">
                    "{delegateVoteReason}"
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-dao-text-hint pt-1 border-t border-primary-200/50 dark:border-primary-700/20">
                Your delegate has not voted on this proposal yet.
              </p>
            )}
          </div>
        )}

        {/* Process button */}
        {canProcess && onProcess && (
          <>
            <Button
              variant="primary"
              size="md"
              loading={isProcessPending}
              onClick={onProcess}
            >
              Process Proposal
            </Button>
            {proposalDataMissing && (
              <div className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-4 py-2">
                <p className="text-xs text-amber-400">
                  Proposal action data is unavailable. Processing may fail for non-signal proposals.
                  This can happen when the indexer hasn't synced the full proposal data yet.
                </p>
              </div>
            )}
          </>
        )}

        {/* Expired notice */}
        {isExpired && (
          <div className="w-full bg-dao-surface/50 border border-dao-border/50 rounded-lg px-4 py-3">
            <p className="text-sm text-dao-text-muted">
              This proposal has expired and can no longer be processed.
              A new proposal must be submitted to take this action.
            </p>
          </div>
        )}

        {/* Sponsor below threshold warning */}
        {canCancelSponsorBelow && (
          <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-400 font-medium">
              Sponsor's voting power is below the threshold
            </p>
            <p className="text-xs text-amber-400/80 mt-1">
              The sponsor of this proposal no longer holds enough voting shares to meet the sponsor threshold. Any member can cancel this proposal.
            </p>
          </div>
        )}

        {/* Cancel button */}
        {canCancel && onCancel && (
          <Button
            variant="danger"
            size="md"
            loading={isCancelPending}
            onClick={onCancel}
          >
            {canCancelSponsorBelow ? 'Cancel (Sponsor Below Threshold)' : 'Cancel Proposal'}
          </Button>
        )}
      </div>
    </div>
  )
}

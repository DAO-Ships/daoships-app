import { useProposalStatus } from '@/hooks/useProposalStatus'
import { ProposalStatus } from '@/types'
import type { Proposal } from '@/types'
import { Button } from '@/components/common/Button'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalActions - Context-aware action buttons based on proposal status
// ═══════════════════════════════════════════════════════════════════════════

interface DaoExpiryConfig {
  voting_period: number
  grace_period: number
  default_expiry_window: number
}

interface ProposalActionsProps {
  proposal: Proposal
  daoId: string
  daoConfig?: DaoExpiryConfig
  userAddress?: string | null
  userShares?: bigint
  sponsorThreshold?: bigint
  hasVoted?: boolean
  onSponsor?: () => void
  onVote?: (approved: boolean) => void
  onProcess?: () => void
  onCancel?: () => void
  proposalDataMissing?: boolean
  isSponsorPending?: boolean
  isVotePending?: boolean
  isProcessPending?: boolean
  isCancelPending?: boolean
}

export function ProposalActions({
  proposal,
  daoId: _daoId,
  daoConfig,
  userAddress,
  userShares = 0n,
  sponsorThreshold = 0n,
  hasVoted = false,
  onSponsor,
  onVote,
  onProcess,
  onCancel,
  proposalDataMissing = false,
  isSponsorPending = false,
  isVotePending = false,
  isProcessPending = false,
  isCancelPending = false,
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

  const isProposer = userAddress.toLowerCase() === proposal.submitter?.toLowerCase()
  const isExpired = status === ProposalStatus.Expired
  const canSponsor = status === ProposalStatus.Submitted && userShares >= sponsorThreshold
  const canVote = status === ProposalStatus.Voting && !hasVoted
  const canProcess = status === ProposalStatus.Ready
  const canCancel = isProposer && (
    status === ProposalStatus.Submitted ||
    status === ProposalStatus.Voting ||
    status === ProposalStatus.Grace
  )

  const showVotedMessage = status === ProposalStatus.Voting && hasVoted
  const hasActions = canSponsor || canVote || canProcess || canCancel || showVotedMessage || isExpired

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
        {canVote && onVote && (
          <>
            <Button
              variant="primary"
              size="md"
              loading={isVotePending}
              onClick={() => onVote(true)}
              className="bg-green-600 hover:bg-green-700 border-green-500"
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
        {status === ProposalStatus.Voting && hasVoted && (
          <span className="text-sm text-dao-text-muted self-center">You have already voted on this proposal.</span>
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
              <div className="w-full bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg px-4 py-2">
                <p className="text-xs text-yellow-400">
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

        {/* Cancel button */}
        {canCancel && onCancel && (
          <Button
            variant="danger"
            size="md"
            loading={isCancelPending}
            onClick={onCancel}
          >
            Cancel Proposal
          </Button>
        )}
      </div>
    </div>
  )
}

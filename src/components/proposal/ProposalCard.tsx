import { Link } from 'react-router-dom'
import type { Proposal } from '@/types'
import { useProposalStatus } from '@/hooks/useProposalStatus'
import { ProposalStatus } from '@/types'
import { ProposalStatusBadge } from './ProposalStatusBadge'
import { formatTokenAmount, parseProposalDetails } from '@/utils/format'
import { formatCountdown } from '@/utils/time'
import { safeBigInt } from '@/utils/bigint'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalCard - Summary card for proposal lists
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalCardProps {
  proposal: Proposal
  daoId: string
}

export function ProposalCard({ proposal, daoId }: ProposalCardProps) {
  const status = useProposalStatus(proposal)

  // Parse the details field for title (first line or JSON title)
  const { title } = parseProposalDetails(proposal.details)
  const yesBalance = safeBigInt(proposal.yes_balance)
  const noBalance = safeBigInt(proposal.no_balance)

  // Calculate time remaining for active phases
  const timeRemaining = getTimeRemaining(proposal, status)

  return (
    <Link
      to={`/dao/${daoId}/proposals/${proposal.proposal_id}`}
      className="card group block transition-all duration-200 hover:border-accent-500/50 hover:shadow-accent-500/10 hover:shadow-lg"
    >
      <div className="px-6 py-4">
        {/* Header row: title + status badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-dao-text-hint mb-1">
              Proposal #{proposal.proposal_id}
            </p>
            <h3 className="text-base font-semibold text-dao-text truncate group-hover:text-accent-400 transition-colors">
              {title}
            </h3>
          </div>
          <ProposalStatusBadge proposal={proposal} />
        </div>

        {/* Vote counts */}
        <div className="flex items-center gap-4 text-sm mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-green-400 font-medium">Yes:</span>
            <span className="text-dao-text-secondary font-mono text-xs">
              {formatTokenAmount(yesBalance)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-red-400 font-medium">No:</span>
            <span className="text-dao-text-secondary font-mono text-xs">
              {formatTokenAmount(noBalance)}
            </span>
          </div>
        </div>

        {/* Time remaining (for active proposals) */}
        {timeRemaining && (
          <p className="text-xs text-dao-text-hint">
            {timeRemaining}
          </p>
        )}
      </div>
    </Link>
  )
}

/**
 * Get human-readable time remaining string based on the current status.
 */
function getTimeRemaining(proposal: Proposal, status: ProposalStatus): string | null {
  if (status === ProposalStatus.Voting && proposal.voting_ends) {
    const endsMs = new Date(proposal.voting_ends).getTime()
    return `Voting ends in ${formatCountdown(endsMs)}`
  }

  if (status === ProposalStatus.Grace && proposal.grace_ends) {
    const endsMs = new Date(proposal.grace_ends).getTime()
    return `Grace ends in ${formatCountdown(endsMs)}`
  }

  if (status === ProposalStatus.Submitted && proposal.expiration) {
    const expiresMs = new Date(proposal.expiration).getTime()
    return `Expires in ${formatCountdown(expiresMs)}`
  }

  return null
}

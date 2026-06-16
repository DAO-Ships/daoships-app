import { useProposalStatus } from '@/hooks/useProposalStatus'
import { ProposalStatus } from '@/types'
import type { Proposal } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalStatusBadge - Time-aware status badge with auto-refresh
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalStatusBadgeProps {
  proposal: Proposal
}

const STATUS_CONFIG: Record<ProposalStatus, { label: string; className: string }> = {
  [ProposalStatus.Voting]: {
    label: 'Voting',
    className: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
  },
  [ProposalStatus.Grace]: {
    label: 'Grace',
    className: 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
  },
  [ProposalStatus.Ready]: {
    label: 'Ready',
    className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  [ProposalStatus.Processed]: {
    label: 'Passed',
    className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  [ProposalStatus.Defeated]: {
    label: 'Defeated',
    className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
  },
  [ProposalStatus.Cancelled]: {
    label: 'Cancelled',
    className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
  },
  [ProposalStatus.Submitted]: {
    label: 'Submitted',
    className: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  [ProposalStatus.Expired]: {
    label: 'Expired',
    className: 'bg-dao-surface/50 text-dao-text-muted border-dao-border/30',
  },
  [ProposalStatus.Unborn]: {
    label: 'Unborn',
    className: 'bg-dao-surface/50 text-dao-text-muted border-dao-border/30',
  },
}

export function ProposalStatusBadge({ proposal }: ProposalStatusBadgeProps) {
  const status = useProposalStatus(proposal)
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      {/* Pulsing dot for active statuses */}
      {(status === ProposalStatus.Voting || status === ProposalStatus.Grace) && (
        <span className="relative mr-1.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {config.label}
    </span>
  )
}

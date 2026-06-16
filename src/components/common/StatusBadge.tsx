import { ProposalStatus } from '@/types/proposal'

// Maps each proposal status to a semantic badge variant (see .badge-* in index.css).
// Expired gets a dashed border so it reads as distinct from the neutral Submitted state.
const STATUS_VARIANT: Record<string, string> = {
  [ProposalStatus.Submitted]: 'badge-neutral',
  [ProposalStatus.Voting]: 'badge-info',
  [ProposalStatus.Grace]: 'badge-warning',
  [ProposalStatus.Ready]: 'badge-success',
  [ProposalStatus.Processed]: 'badge-success',
  [ProposalStatus.ActionFailed]: 'badge-warning',
  [ProposalStatus.Cancelled]: 'badge-danger',
  [ProposalStatus.Defeated]: 'badge-danger',
  [ProposalStatus.Expired]: 'badge-neutral border border-dashed border-dao-border',
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const isActive = status === ProposalStatus.Voting || status === ProposalStatus.Grace
  return (
    <span className={`badge ${STATUS_VARIANT[status] || 'badge-neutral'} ${className} ${isActive ? 'relative' : ''}`}>
      {isActive && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500" />
        </span>
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

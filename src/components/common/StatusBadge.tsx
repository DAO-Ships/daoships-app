import { ProposalStatus } from '@/types/proposal'

const STATUS_STYLES: Record<string, string> = {
  [ProposalStatus.Submitted]: 'bg-dao-surface text-dao-text-muted',
  [ProposalStatus.Voting]: 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400',
  [ProposalStatus.Grace]: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  [ProposalStatus.Ready]: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
  [ProposalStatus.Processed]: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500',
  [ProposalStatus.ActionFailed]: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
  [ProposalStatus.Cancelled]: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  [ProposalStatus.Defeated]: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  [ProposalStatus.Expired]: 'bg-dao-surface text-dao-text-hint',
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const isActive = status === ProposalStatus.Voting || status === ProposalStatus.Grace
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || 'bg-dao-surface text-dao-text-muted'} ${className} ${isActive ? 'relative' : ''}`}>
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

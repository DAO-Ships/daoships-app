import type { Proposal } from '@/types'
import { ProposalStatus } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// ProposalTimeline - Visual step-by-step timeline for proposal lifecycle
// ═══════════════════════════════════════════════════════════════════════════

interface ProposalTimelineProps {
  proposal: Proposal
  status: string
}

interface TimelineStep {
  key: string
  label: string
  timestamp?: string | null
}

/**
 * Map status string to its position in the timeline for comparison.
 */
function getStepIndex(status: string): number {
  const statusMap: Record<string, number> = {
    [ProposalStatus.Submitted]: 0,
    sponsored: 1,
    [ProposalStatus.Voting]: 2,
    [ProposalStatus.Grace]: 3,
    [ProposalStatus.Ready]: 4,
    [ProposalStatus.Processed]: 5,
    // Terminal states map to their effective position
    [ProposalStatus.Cancelled]: -1,
    [ProposalStatus.Defeated]: 5,
    [ProposalStatus.Expired]: -1,
    [ProposalStatus.Unborn]: -1,
  }
  return statusMap[status] ?? -1
}

export function ProposalTimeline({ proposal, status }: ProposalTimelineProps) {
  // Determine effective current step index
  let currentIndex = getStepIndex(status)
  // If sponsored, at least step 1
  if (proposal.sponsored && currentIndex < 1) {
    currentIndex = 1
  }

  const steps: TimelineStep[] = [
    {
      key: ProposalStatus.Submitted,
      label: 'Submitted',
      timestamp: proposal.created_at,
    },
    {
      key: 'sponsored',
      label: 'Sponsored',
      timestamp: proposal.sponsor_tx_at,
    },
    {
      key: ProposalStatus.Voting,
      label: 'Voting',
      timestamp: proposal.voting_starts,
    },
    {
      key: ProposalStatus.Grace,
      label: 'Grace',
      timestamp: proposal.voting_ends,
    },
    {
      key: ProposalStatus.Ready,
      label: 'Ready',
      timestamp: proposal.grace_ends,
    },
    {
      key: ProposalStatus.Processed,
      label: 'Processed',
      timestamp: proposal.process_tx_at,
    },
  ]

  // Check for terminal states
  const isTerminal = status === ProposalStatus.Cancelled ||
    status === ProposalStatus.Defeated ||
    status === ProposalStatus.Expired

  return (
    <div className="card px-6 py-5">
      <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-4">
        Timeline
      </h3>

      <div className="relative">
        {/* Connecting line */}
        <div className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-dao-border" />

        <div className="space-y-4">
          {steps.map((step, index) => {
            const stepIndex = index
            const isComplete = stepIndex < currentIndex
            const isCurrent = stepIndex === currentIndex
            return (
              <div key={step.key} className="relative flex items-start gap-3 pl-1">
                {/* Step dot */}
                <div
                  className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                    isComplete
                      ? 'bg-green-500 border-green-500'
                      : isCurrent
                        ? 'bg-accent-500 border-accent-500'
                        : 'bg-dao-dark-3 border-dao-border'
                  }`}
                >
                  {isComplete && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>

                {/* Step content */}
                <div className="min-w-0 pt-0.5">
                  <p
                    className={`text-sm font-medium ${
                      isComplete
                        ? 'text-green-400'
                        : isCurrent
                          ? 'text-accent-400'
                          : 'text-dao-text-hint'
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.timestamp && (isComplete || isCurrent) && (
                    <p className="text-xs text-dao-text-hint mt-0.5">
                      {new Date(step.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {/* Terminal state indicator */}
          {isTerminal && (
            <div className="relative flex items-start gap-3 pl-1">
              <div
                className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                  status === ProposalStatus.Defeated
                    ? 'bg-red-500 border-red-500'
                    : status === ProposalStatus.Cancelled
                      ? 'bg-red-500 border-red-500'
                      : 'bg-dao-surface border-dao-surface'
                }`}
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium text-red-400 capitalize">
                  {status}
                </p>
                {status === ProposalStatus.Cancelled && proposal.cancelled_tx_at && (
                  <p className="text-xs text-dao-text-hint mt-0.5">
                    {new Date(proposal.cancelled_tx_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

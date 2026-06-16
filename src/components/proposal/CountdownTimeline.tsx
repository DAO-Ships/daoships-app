import { useState, useEffect } from 'react'
import { ProposalStatus } from '@/types/proposal'
import type { Proposal } from '@/types'
import { Card } from '@/components/common/Card'
import { formatCountdown, formatIndexerDate } from '@/utils/time'

/**
 * Isolated countdown timeline that owns its own 1-second tick state.
 * Only this component re-renders each second — the parent ProposalDetail
 * tree is unaffected.
 */
export function CountdownTimeline({ proposal, status }: { proposal: Proposal; status: string }) {
  // Internal tick — only re-renders this component, not the parent
  const [, setTick] = useState(0)
  const isCountdownActive = status === ProposalStatus.Voting || status === ProposalStatus.Grace

  useEffect(() => {
    if (!isCountdownActive) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isCountdownActive])

  return (
    <Card header={<h2 className="text-lg font-semibold text-dao-text">Timeline</h2>}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-dao-text-muted">Submitted</span>
          <span className="text-dao-text-secondary">
            {formatIndexerDate(proposal.created_at, { withTime: true })}
          </span>
        </div>
        {proposal.voting_starts && (
          <div className="flex items-center justify-between">
            <span className="text-dao-text-muted">Voting started</span>
            <span className="text-dao-text-secondary">
              {formatIndexerDate(proposal.voting_starts, { withTime: true })}
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
                : formatIndexerDate(proposal.voting_ends, { withTime: true })}
            </span>
          </div>
        )}
        {proposal.grace_ends && (
          <div className="flex items-center justify-between">
            <span className="text-dao-text-muted">
              {new Date(proposal.grace_ends!).getTime() > Date.now() ? 'Grace ends' : 'Grace ended'}
            </span>
            <span className="text-dao-text-secondary">
              {status === ProposalStatus.Grace
                ? formatCountdown(new Date(proposal.grace_ends).getTime())
                : formatIndexerDate(proposal.grace_ends, { withTime: true })}
            </span>
          </div>
        )}
        {proposal.processed && proposal.process_tx_at && (
          <div className="flex items-center justify-between">
            <span className="text-dao-text-muted">Processed</span>
            <span className="text-dao-text-secondary">
              {formatIndexerDate(proposal.process_tx_at, { withTime: true })}
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}

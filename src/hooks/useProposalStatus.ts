import { useState, useEffect, useRef } from 'react'
import { deriveProposalStatus, ProposalStatus } from '@/types'
import type { Proposal, DaoExpiryConfig } from '@/types'

/**
 * Computes the current proposal status on a 1-second interval.
 * Uses client-side time to determine whether voting/grace periods have elapsed.
 *
 * Dependencies are stabilized on primitive values (proposal.id + key timestamps)
 * so the interval doesn't churn when parent re-renders produce new object references.
 *
 * Pass daoConfig to enable auto-expiry detection for proposals without
 * an explicit expiration timestamp.
 */
export function useProposalStatus(
  proposal: Proposal | null | undefined,
  daoConfig?: DaoExpiryConfig,
) {
  const [status, setStatus] = useState<ProposalStatus>(ProposalStatus.Submitted)

  // Store current values in refs so the interval closure always sees fresh data
  const proposalRef = useRef(proposal)
  const configRef = useRef(daoConfig)
  proposalRef.current = proposal
  configRef.current = daoConfig

  // Stable primitive key — only recreate interval when the proposal identity
  // or its time-sensitive fields actually change
  const proposalId = proposal?.id
  const votingEnds = proposal?.voting_ends
  const graceEnds = proposal?.grace_ends
  const expiration = proposal?.expiration
  const cancelled = proposal?.cancelled
  const processed = proposal?.processed
  const votingPeriod = daoConfig?.voting_period
  const gracePeriod = daoConfig?.grace_period
  const expiryWindow = daoConfig?.default_expiry_window

  useEffect(() => {
    if (!proposalRef.current) return

    const update = () => setStatus(deriveProposalStatus(proposalRef.current!, configRef.current))
    update()

    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [proposalId, votingEnds, graceEnds, expiration, cancelled, processed, votingPeriod, gracePeriod, expiryWindow])

  return status
}

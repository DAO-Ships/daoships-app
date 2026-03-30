import { useState, useEffect } from 'react'
import { deriveProposalStatus, ProposalStatus } from '@/types'
import type { Proposal } from '@/types'

interface DaoExpiryConfig {
  voting_period: number
  grace_period: number
  default_expiry_window: number
}

/**
 * Computes the current proposal status on a 1-second interval.
 * Uses client-side time to determine whether voting/grace periods have elapsed.
 *
 * Pass daoConfig to enable auto-expiry detection for proposals without
 * an explicit expiration timestamp.
 */
export function useProposalStatus(
  proposal: Proposal | null | undefined,
  daoConfig?: DaoExpiryConfig,
) {
  const [status, setStatus] = useState<ProposalStatus>(ProposalStatus.Submitted)

  useEffect(() => {
    if (!proposal) return

    const update = () => setStatus(deriveProposalStatus(proposal, daoConfig))
    update()

    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [proposal, daoConfig])

  return status
}

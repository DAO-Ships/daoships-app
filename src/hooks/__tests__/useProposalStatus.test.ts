import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Isolate the hook's interval/ref wiring from the derivation itself (deriveProposalStatus
// is a pure function covered in the types layer). Keep the real ProposalStatus enum.
vi.mock('@/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/types')>()
  return { ...actual, deriveProposalStatus: vi.fn() }
})

import { useProposalStatus } from '../useProposalStatus'
import { deriveProposalStatus, ProposalStatus } from '@/types'
import type { Proposal, DaoExpiryConfig } from '@/types'

const derive = vi.mocked(deriveProposalStatus)

// Only the fields the hook reads for its stable dependency key need to be real.
function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: '0xdao-1',
    voting_ends: '2026-01-01T00:00:00Z',
    grace_ends: '2026-01-02T00:00:00Z',
    expiration: null,
    cancelled: false,
    processed: false,
    ...overrides,
  } as Proposal

}

beforeEach(() => {
  vi.useFakeTimers()
  derive.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useProposalStatus', () => {
  it('stays at the default and never derives when there is no proposal', () => {
    const { result } = renderHook(() => useProposalStatus(null))
    expect(result.current).toBe(ProposalStatus.Submitted)
    expect(derive).not.toHaveBeenCalled()
  })

  it('derives once immediately on mount', () => {
    derive.mockReturnValue(ProposalStatus.Voting)
    const { result } = renderHook(() => useProposalStatus(makeProposal()))
    expect(result.current).toBe(ProposalStatus.Voting)
    expect(derive).toHaveBeenCalledTimes(1)
  })

  it('re-derives every second so a period boundary is picked up without a re-render', () => {
    derive.mockReturnValue(ProposalStatus.Voting)
    const { result } = renderHook(() => useProposalStatus(makeProposal()))
    expect(result.current).toBe(ProposalStatus.Voting)

    // Time crosses into grace: the next tick reflects it with no prop change.
    derive.mockReturnValue(ProposalStatus.Grace)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(ProposalStatus.Grace)
  })

  it('passes the DAO expiry config through to the derivation', () => {
    derive.mockReturnValue(ProposalStatus.Voting)
    const config: DaoExpiryConfig = {
      voting_period: 604800,
      grace_period: 259200,
      default_expiry_window: 604800,
    } as DaoExpiryConfig
    const proposal = makeProposal()
    renderHook(() => useProposalStatus(proposal, config))
    expect(derive).toHaveBeenCalledWith(proposal, config)
  })

  it('stops deriving after unmount (interval cleared)', () => {
    derive.mockReturnValue(ProposalStatus.Voting)
    const { unmount } = renderHook(() => useProposalStatus(makeProposal()))
    expect(derive).toHaveBeenCalledTimes(1)

    unmount()
    act(() => vi.advanceTimersByTime(5000))
    expect(derive).toHaveBeenCalledTimes(1) // no further ticks
  })
})

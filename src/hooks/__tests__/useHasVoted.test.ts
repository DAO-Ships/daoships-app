import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface CapturedQueryOptions {
  enabled?: boolean
  refetchInterval?: (q: { state: { data: unknown } }) => number | false
  refetchOnWindowFocus?: boolean
  queryKey?: unknown[]
  staleTime?: number
}

// Capture the options handed to useQuery so we can assert the gating/polling logic that
// guards against double-voting — without standing up a real query client.
const captured = vi.hoisted(() => ({ opts: {} as CapturedQueryOptions }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: CapturedQueryOptions) => {
    captured.opts = opts
    return { data: undefined }
  },
}))
vi.mock('@/services/DaoService', () => ({ daoService: { hasVoted: vi.fn() } }))

import { useHasVoted } from '../useHasVoted'

beforeEach(() => {
  captured.opts = {}
})

describe('useHasVoted — enabled gating', () => {
  it('is enabled when all three inputs are present', () => {
    renderHook(() => useHasVoted('0xdao', 5, '0xmember'))
    expect(captured.opts.enabled).toBe(true)
  })

  it('stays enabled for proposal id 0 (must not be treated as falsy)', () => {
    // A naive `!!proposalId` would disable the very first proposal in a DAO.
    renderHook(() => useHasVoted('0xdao', 0, '0xmember'))
    expect(captured.opts.enabled).toBe(true)
  })

  it('is disabled when the member address is missing', () => {
    renderHook(() => useHasVoted('0xdao', 5, undefined))
    expect(captured.opts.enabled).toBe(false)
  })

  it('is disabled when the proposal id is undefined', () => {
    renderHook(() => useHasVoted('0xdao', undefined, '0xmember'))
    expect(captured.opts.enabled).toBe(false)
  })
})

describe('useHasVoted — self-correcting poll', () => {
  it('keeps polling every 5s while the answer is still "not voted"', () => {
    // Indexer lag returns false before a vote is ingested; polling lets it self-correct
    // so the Vote buttons do not re-enable into a double-vote revert.
    renderHook(() => useHasVoted('0xdao', 5, '0xmember'))
    const interval = captured.opts.refetchInterval!
    expect(interval({ state: { data: false } })).toBe(5000)
    expect(interval({ state: { data: undefined } })).toBe(5000)
  })

  it('stops polling once the member is confirmed to have voted', () => {
    renderHook(() => useHasVoted('0xdao', 5, '0xmember'))
    expect(captured.opts.refetchInterval!({ state: { data: true } })).toBe(false)
  })

  it('re-checks on window focus', () => {
    renderHook(() => useHasVoted('0xdao', 5, '0xmember'))
    expect(captured.opts.refetchOnWindowFocus).toBe(true)
  })
})

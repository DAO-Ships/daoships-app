import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface CapturedQueryOptions {
  enabled?: boolean
  queryKey?: unknown[]
  staleTime?: number
}

const captured = vi.hoisted(() => ({ opts: {} as CapturedQueryOptions }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: CapturedQueryOptions) => {
    captured.opts = opts
    return { data: undefined }
  },
}))
const providerReady = vi.hoisted(() => ({ value: true }))
vi.mock('../useProviderReady', () => ({
  useProviderReady: () => providerReady.value,
}))
vi.mock('@/services/DaoService', () => ({ daoService: { getPriorVotes: vi.fn() } }))

import { usePriorVotes } from '../usePriorVotes'

beforeEach(() => {
  captured.opts = {}
  providerReady.value = true
})

describe('usePriorVotes — timepoint derivation', () => {
  it('converts votingStarts (ISO) to the unix-second snapshot in the query key', () => {
    renderHook(() => usePriorVotes('0xdao', '0xmember', '2026-01-01T00:00:00Z'))
    const expected = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000)
    expect(captured.opts.queryKey).toEqual(['priorVotes', '0xdao', '0xmember', expected])
    expect(captured.opts.enabled).toBe(true)
  })
})

describe('usePriorVotes — enabled gating (anti-revert guard)', () => {
  it('is disabled when votingStarts is null (no snapshot to read)', () => {
    renderHook(() => usePriorVotes('0xdao', '0xmember', null))
    expect(captured.opts.enabled).toBe(false)
  })

  it('is disabled when the member address is missing', () => {
    renderHook(() => usePriorVotes('0xdao', undefined, '2026-01-01T00:00:00Z'))
    expect(captured.opts.enabled).toBe(false)
  })

  it('is disabled until the wallet provider is ready (all RPC goes through it)', () => {
    providerReady.value = false
    renderHook(() => usePriorVotes('0xdao', '0xmember', '2026-01-01T00:00:00Z'))
    expect(captured.opts.enabled).toBe(false)
  })

  it('uses a long staleTime since snapshot power is immutable once voting starts', () => {
    renderHook(() => usePriorVotes('0xdao', '0xmember', '2026-01-01T00:00:00Z'))
    expect(captured.opts.staleTime).toBe(5 * 60_000)
  })
})

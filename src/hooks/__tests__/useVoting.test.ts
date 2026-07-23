import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface MutationConfig {
  mutationFn: (arg: never) => Promise<unknown>
  onSuccess?: () => void
}

const qc = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  setQueriesData: vi.fn(),
}))
const mut = vi.hoisted(() => ({ config: null as MutationConfig | null }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => qc,
  useMutation: (config: MutationConfig) => {
    mut.config = config
    return { mutateAsync: config.mutationFn, isPending: false, error: null }
  },
}))
const submitVote = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/services/DaoService', () => ({ daoService: { submitVote } }))

import { useVoting } from '../useVoting'

/** Every queryKey passed to invalidateQueries so far, as JSON for easy matching. */
function invalidatedKeys(): string[] {
  return qc.invalidateQueries.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
}

beforeEach(() => {
  vi.useFakeTimers()
  qc.invalidateQueries.mockClear()
  qc.setQueriesData.mockClear()
  submitVote.mockClear()
  mut.config = null
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useVoting — mutationFn', () => {
  it('submits the vote with a numeric proposal id and the approval flag', async () => {
    renderHook(() => useVoting('0xdao', '7'))
    await mut.config!.mutationFn(true as never)
    expect(submitVote).toHaveBeenCalledWith('0xdao', 7, true)
  })
})

describe('useVoting — onSuccess cache work', () => {
  it('invalidates the proposal-votes key useProposalVotes actually registers (not the dead ["votes"] key)', () => {
    renderHook(() => useVoting('0xdao', '7'))
    mut.config!.onSuccess!()

    const keys = invalidatedKeys()
    expect(keys).toContain(JSON.stringify(['proposalVotes', '0xdao-7']))
    // The pre-fix key matched no registered query, so the votes list never refreshed.
    expect(keys).not.toContain(JSON.stringify(['votes', '0xdao-7']))
    expect(keys).toContain(JSON.stringify(['proposal', '0xdao', '7']))
    expect(keys).toContain(JSON.stringify(['proposals', '0xdao']))
  })

  it('optimistically marks hasVoted true so the buttons cannot re-enable into a double vote', () => {
    renderHook(() => useVoting('0xdao', '7'))
    mut.config!.onSuccess!()

    expect(qc.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ['hasVoted', '0xdao', 7] },
      true,
    )
  })

  it('re-invalidates after 4s to absorb indexer lag', () => {
    renderHook(() => useVoting('0xdao', '7'))
    mut.config!.onSuccess!()
    const firstRoundCalls = qc.invalidateQueries.mock.calls.length

    vi.advanceTimersByTime(4000)
    expect(qc.invalidateQueries.mock.calls.length).toBe(firstRoundCalls * 2)
  })
})

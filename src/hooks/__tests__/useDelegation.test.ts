import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface MutationConfig {
  mutationFn: (arg: never) => Promise<unknown>
  onSuccess?: () => void
}

const qc = vi.hoisted(() => ({ invalidateQueries: vi.fn() }))
const mut = vi.hoisted(() => ({ config: null as MutationConfig | null }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => qc,
  useMutation: (config: MutationConfig) => {
    mut.config = config
    return { mutateAsync: config.mutationFn, isPending: false }
  },
}))
const delegate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/services/DaoService', () => ({ daoService: { delegate } }))

import { useDelegation } from '../useDelegation'

function invalidatedKeys(): string[] {
  return qc.invalidateQueries.mock.calls.map((c) =>
    JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
}

beforeEach(() => {
  vi.useFakeTimers()
  qc.invalidateQueries.mockClear()
  delegate.mockClear()
  mut.config = null
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useDelegation', () => {
  it('delegates via the shares token address to the target', async () => {
    renderHook(() => useDelegation('0xdao'))
    await mut.config!.mutationFn({ sharesAddress: '0xshares', to: '0xdelegate' } as never)
    expect(delegate).toHaveBeenCalledWith('0xshares', '0xdelegate')
  })

  it('invalidates member and dao caches on success', () => {
    renderHook(() => useDelegation('0xdao'))
    mut.config!.onSuccess!()
    const keys = invalidatedKeys()
    expect(keys).toContain(JSON.stringify(['members', '0xdao']))
    expect(keys).toContain(JSON.stringify(['member', '0xdao']))
    expect(keys).toContain(JSON.stringify(['dao', '0xdao']))
  })

  it('re-invalidates after 4s for indexer lag', () => {
    renderHook(() => useDelegation('0xdao'))
    mut.config!.onSuccess!()
    const firstRound = qc.invalidateQueries.mock.calls.length
    vi.advanceTimersByTime(4000)
    expect(qc.invalidateQueries.mock.calls.length).toBe(firstRound * 2)
  })
})

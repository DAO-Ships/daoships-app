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
const ragequit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/services/DaoService', () => ({ daoService: { ragequit } }))

import { useRagequit } from '../useRagequit'

function invalidatedKeys(): string[] {
  return qc.invalidateQueries.mock.calls.map((c) =>
    JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
}

beforeEach(() => {
  vi.useFakeTimers()
  qc.invalidateQueries.mockClear()
  ragequit.mockClear()
  mut.config = null
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useRagequit', () => {
  it('forwards every ragequit parameter to the service in order', async () => {
    renderHook(() => useRagequit('0xdao'))
    await mut.config!.mutationFn({
      daoShipAddress: '0xship',
      to: '0xrecipient',
      sharesToBurn: 5n,
      lootToBurn: 3n,
      tokens: ['0xtokenA', '0xtokenB'],
    } as never)

    expect(ragequit).toHaveBeenCalledWith('0xship', '0xrecipient', 5n, 3n, [
      '0xtokenA',
      '0xtokenB',
    ])
  })

  it('invalidates member and treasury caches (both change when tokens are withdrawn)', () => {
    renderHook(() => useRagequit('0xdao'))
    mut.config!.onSuccess!()

    const keys = invalidatedKeys()
    expect(keys).toContain(JSON.stringify(['members', '0xdao']))
    expect(keys).toContain(JSON.stringify(['treasury', '0xdao']))
    expect(keys).toContain(JSON.stringify(['treasuryBalances']))
    expect(keys).toContain(JSON.stringify(['dao', '0xdao']))
  })

  it('re-invalidates after 4s for indexer lag', () => {
    renderHook(() => useRagequit('0xdao'))
    mut.config!.onSuccess!()
    const firstRound = qc.invalidateQueries.mock.calls.length
    vi.advanceTimersByTime(4000)
    expect(qc.invalidateQueries.mock.calls.length).toBe(firstRound * 2)
  })
})

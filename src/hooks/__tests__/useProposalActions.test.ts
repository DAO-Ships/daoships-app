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
// Three useMutation calls in this hook — capture them in call order (sponsor, process, cancel).
const mut = vi.hoisted(() => ({ configs: [] as MutationConfig[] }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => qc,
  useMutation: (config: MutationConfig) => {
    mut.configs.push(config)
    return { mutateAsync: config.mutationFn, isPending: false, error: null }
  },
}))
const svc = vi.hoisted(() => ({
  sponsorProposal: vi.fn().mockResolvedValue(undefined),
  processProposal: vi.fn().mockResolvedValue(undefined),
  cancelProposal: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/DaoService', () => ({ daoService: svc }))

import { useProposalActions } from '../useProposalActions'

function invalidatedKeys(): string[] {
  return qc.invalidateQueries.mock.calls.map((c) =>
    JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
}

beforeEach(() => {
  vi.useFakeTimers()
  qc.invalidateQueries.mockClear()
  Object.values(svc).forEach((f) => f.mockClear())
  mut.configs = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useProposalActions — mutationFns call the right service method', () => {
  it('sponsor -> sponsorProposal(daoId, numericId)', async () => {
    renderHook(() => useProposalActions('0xdao', '7'))
    await mut.configs[0].mutationFn(undefined as never)
    expect(svc.sponsorProposal).toHaveBeenCalledWith('0xdao', 7)
  })

  it('process -> processProposal(daoId, numericId, proposalData)', async () => {
    renderHook(() => useProposalActions('0xdao', '7'))
    await mut.configs[1].mutationFn('0xdeadbeef' as never)
    expect(svc.processProposal).toHaveBeenCalledWith('0xdao', 7, '0xdeadbeef')
  })

  it('cancel -> cancelProposal(daoId, numericId)', async () => {
    renderHook(() => useProposalActions('0xdao', '7'))
    await mut.configs[2].mutationFn(undefined as never)
    expect(svc.cancelProposal).toHaveBeenCalledWith('0xdao', 7)
  })
})

describe('useProposalActions — shared invalidation', () => {
  it('processing invalidates treasury and membership caches (they change on execution)', () => {
    renderHook(() => useProposalActions('0xdao', '7'))
    mut.configs[1].onSuccess!()

    const keys = invalidatedKeys()
    expect(keys).toContain(JSON.stringify(['proposal', '0xdao', '7']))
    expect(keys).toContain(JSON.stringify(['treasury', '0xdao']))
    expect(keys).toContain(JSON.stringify(['treasuryBalances']))
    expect(keys).toContain(JSON.stringify(['members', '0xdao']))
  })

  it('re-invalidates after 4s for indexer lag', () => {
    renderHook(() => useProposalActions('0xdao', '7'))
    mut.configs[0].onSuccess!()
    const firstRound = qc.invalidateQueries.mock.calls.length
    vi.advanceTimersByTime(4000)
    expect(qc.invalidateQueries.mock.calls.length).toBe(firstRound * 2)
  })
})

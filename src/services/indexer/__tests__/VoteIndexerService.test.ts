import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

// The service reads a module-level `supabase` singleton. A getter lets each test swap
// the client — or make it null to exercise the direct-RPC short-circuit.
const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { voteIndexerService } from '../VoteIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('VoteIndexerService.getProposalVotes', () => {
  it('returns [] without touching the indexer when supabase is unconfigured', async () => {
    holder.client = null
    expect(await voteIndexerService.getProposalVotes('dao-1')).toEqual([])
  })

  it('filters by the exact proposal composite id, newest first', async () => {
    const client = makeClient({ ds_votes: { data: [{ id: 'v1' }], error: null } })
    holder.client = client

    const rows = await voteIndexerService.getProposalVotes('0xabc-3')

    expect(rows).toEqual([{ id: 'v1' }])
    const q = client.queries[0]
    expect(q.table).toBe('ds_votes')
    expect(q.eqArg('proposal_id')).toBe('0xabc-3')
    expect(q.orders).toContainEqual(['created_at', { ascending: false }])
  })

  it('returns [] (not null) when the query yields no rows', async () => {
    holder.client = makeClient({ ds_votes: { data: null, error: null } })
    expect(await voteIndexerService.getProposalVotes('0xabc-3')).toEqual([])
  })

  it('throws on a query error so React Query enters isError instead of showing empty', async () => {
    holder.client = makeClient({ ds_votes: { data: null, error: { message: 'down' } } })
    await expect(voteIndexerService.getProposalVotes('0xabc-3')).rejects.toThrow(
      '[VoteIndexerService] getProposalVotes: down',
    )
  })
})

describe('VoteIndexerService.getMemberVotes', () => {
  it('lowercases the voter address before querying', async () => {
    const client = makeClient({ ds_votes: { data: [], error: null } })
    holder.client = client

    await voteIndexerService.getMemberVotes('dao-1', '0xAbCDef0000000000000000000000000000001234')

    const q = client.queries[0]
    expect(q.eqArg('voter')).toBe('0xabcdef0000000000000000000000000000001234')
    expect(q.eqArg('dao_id')).toBe('dao-1')
  })

  it('throws with the member-votes context on error', async () => {
    holder.client = makeClient({ ds_votes: { data: null, error: { message: 'boom' } } })
    await expect(voteIndexerService.getMemberVotes('dao-1', '0xABC')).rejects.toThrow(
      '[VoteIndexerService] getMemberVotes: boom',
    )
  })

  it('short-circuits to [] when supabase is null', async () => {
    holder.client = null
    expect(await voteIndexerService.getMemberVotes('dao-1', '0xABC')).toEqual([])
  })
})

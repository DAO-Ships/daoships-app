import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { proposalIndexerService } from '../ProposalIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listProposals — column projection', () => {
  it('never selects the heavy/attacker-authored columns for the list view', async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client

    await proposalIndexerService.listProposals('dao-1')

    const cols = client.queries[0].selectArg()!
    // proposal_data is the encoded MultiSend blob; pulling it per row re-downloads the
    // DAO's entire action payload on every poll. It must not be in the list projection.
    expect(cols).not.toContain('proposal_data,')
    expect(cols).not.toMatch(/(^|,)proposal_data($|,)/)
    // But the columns the list actually renders must be present.
    expect(cols).toContain('proposal_id')
    expect(cols).toContain('yes_balance')
  })

  it('orders by proposal_id descending', async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client
    await proposalIndexerService.listProposals('dao-1')
    expect(client.queries[0].orders).toContainEqual(['proposal_id', { ascending: false }])
  })
})

describe('listProposals — status filter', () => {
  it("maps 'active' to cancelled=false AND processed=false", async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client
    await proposalIndexerService.listProposals('dao-1', { status: 'active' })
    const q = client.queries[0]
    expect(q.eqArg('cancelled')).toBe(false)
    expect(q.eqArg('processed')).toBe(false)
  })

  it("maps 'cancelled' to cancelled=true only", async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client
    await proposalIndexerService.listProposals('dao-1', { status: 'cancelled' })
    const q = client.queries[0]
    expect(q.eqArg('cancelled')).toBe(true)
    expect(q.eqArg('processed')).toBeUndefined()
  })

  it("maps 'processed' to processed=true only", async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client
    await proposalIndexerService.listProposals('dao-1', { status: 'processed' })
    const q = client.queries[0]
    expect(q.eqArg('processed')).toBe(true)
    expect(q.eqArg('cancelled')).toBeUndefined()
  })

  it('applies no status filter when none is given', async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client
    await proposalIndexerService.listProposals('dao-1')
    const q = client.queries[0]
    expect(q.eqArg('cancelled')).toBeUndefined()
    expect(q.eqArg('processed')).toBeUndefined()
  })
})

describe('getActiveProposals', () => {
  it('is listProposals scoped to the active status', async () => {
    const client = makeClient({ ds_proposals: { data: [], error: null } })
    holder.client = client
    await proposalIndexerService.getActiveProposals('dao-1')
    const q = client.queries[0]
    expect(q.eqArg('cancelled')).toBe(false)
    expect(q.eqArg('processed')).toBe(false)
  })
})

describe('getProposal', () => {
  it('reads a single row by the composite id and returns null when absent', async () => {
    holder.client = makeClient({ ds_proposals: { data: null, error: null } })
    expect(await proposalIndexerService.getProposal('0xabc-3')).toBeNull()
  })

  it('throws on a query error', async () => {
    holder.client = makeClient({ ds_proposals: { data: null, error: { message: 'x' } } })
    await expect(proposalIndexerService.getProposal('0xabc-3')).rejects.toThrow(
      '[ProposalIndexerService] getProposal: x',
    )
  })
})

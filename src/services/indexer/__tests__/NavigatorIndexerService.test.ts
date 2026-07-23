import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { navigatorIndexerService } from '../NavigatorIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listSanctionedNavigators', () => {
  it('applies the type filter only when a type is supplied', async () => {
    const client = makeClient({ ds_navigators: { data: [], error: null } })
    holder.client = client

    await navigatorIndexerService.listSanctionedNavigators('dao-1', 'signal')

    const q = client.queries[0]
    expect(q.eqArg('trust_status')).toBe('sanctioned')
    expect(q.eqArg('navigator_type')).toBe('signal')
  })

  it('omits the type filter when no type is supplied', async () => {
    const client = makeClient({ ds_navigators: { data: [], error: null } })
    holder.client = client

    await navigatorIndexerService.listSanctionedNavigators('dao-1')

    expect(client.queries[0].eqArg('navigator_type')).toBeUndefined()
    expect(client.queries[0].eqArg('trust_status')).toBe('sanctioned')
  })
})

describe('getNavigatorEvents / getNftClaims', () => {
  it('lowercases the navigator address and orders events by block descending', async () => {
    const client = makeClient({ ds_navigator_events: { data: [], error: null } })
    holder.client = client

    await navigatorIndexerService.getNavigatorEvents(
      'dao-1',
      '0xNAVaddress000000000000000000000000005678',
    )

    const q = client.queries[0]
    expect(q.eqArg('navigator_address')).toBe('0xnavaddress000000000000000000000000005678')
    expect(q.orders).toContainEqual(['block_number', { ascending: false }])
  })

  it('lowercases the navigator address for NFT claims', async () => {
    const client = makeClient({ ds_nft_claims: { data: [], error: null } })
    holder.client = client

    await navigatorIndexerService.getNftClaims('dao-1', '0xABCDEF')

    expect(client.queries[0].eqArg('navigator_address')).toBe('0xabcdef')
  })
})

describe('getSignalPoll', () => {
  it('builds the id as `${navigator.toLowerCase()}-${pollId}` and reads a single row', async () => {
    const client = makeClient({ ds_signal_polls: { data: { id: 'x', tally: [1, 2] }, error: null } })
    holder.client = client

    const poll = await navigatorIndexerService.getSignalPoll('0xNAV', '7')

    expect(poll).toEqual({ id: 'x', tally: [1, 2] })
    const q = client.queries[0]
    expect(q.eqArg('id')).toBe('0xnav-7')
    expect(q.singled).toBe(true)
  })

  it('returns null (not undefined) when the poll does not exist', async () => {
    holder.client = makeClient({ ds_signal_polls: { data: null, error: null } })
    expect(await navigatorIndexerService.getSignalPoll('0xNAV', '7')).toBeNull()
  })

  it('short-circuits to null when supabase is unconfigured', async () => {
    holder.client = null
    expect(await navigatorIndexerService.getSignalPoll('0xNAV', '7')).toBeNull()
  })
})

describe('hasVotedOnPoll', () => {
  it('composes the vote id from navigator, poll, and voter — all lowercased', async () => {
    const client = makeClient({ ds_signal_votes: { data: { option: 2 }, error: null } })
    holder.client = client

    const result = await navigatorIndexerService.hasVotedOnPoll('0xNAV', '7', '0xVOTER')

    expect(result).toEqual({ voted: true, option: 2 })
    expect(client.queries[0].eqArg('id')).toBe('0xnav-7-0xvoter')
  })

  it('reports not-voted when no row matches', async () => {
    holder.client = makeClient({ ds_signal_votes: { data: null, error: null } })
    expect(await navigatorIndexerService.hasVotedOnPoll('0xNAV', '7', '0xVOTER')).toEqual({
      voted: false,
    })
  })

  it('reports not-voted (without querying) in direct-RPC mode', async () => {
    holder.client = null
    expect(await navigatorIndexerService.hasVotedOnPoll('0xNAV', '7', '0xVOTER')).toEqual({
      voted: false,
    })
  })

  it('throws on a real query error rather than masking it as not-voted', async () => {
    holder.client = makeClient({ ds_signal_votes: { data: null, error: { message: 'rls' } } })
    await expect(
      navigatorIndexerService.hasVotedOnPoll('0xNAV', '7', '0xVOTER'),
    ).rejects.toThrow('[NavigatorIndexerService] hasVotedOnPoll: rls')
  })
})

describe('listSignalPolls', () => {
  it('scopes to one navigator (lowercased) when given, ordered by newest window', async () => {
    const client = makeClient({ ds_signal_polls: { data: [], error: null } })
    holder.client = client

    await navigatorIndexerService.listSignalPolls('dao-1', '0xNAV')

    const q = client.queries[0]
    expect(q.eqArg('navigator_address')).toBe('0xnav')
    expect(q.orders).toContainEqual(['voting_starts', { ascending: false }])
  })

  it('does not scope by navigator when none is given', async () => {
    const client = makeClient({ ds_signal_polls: { data: [], error: null } })
    holder.client = client

    await navigatorIndexerService.listSignalPolls('dao-1')

    expect(client.queries[0].eqArg('navigator_address')).toBeUndefined()
  })
})

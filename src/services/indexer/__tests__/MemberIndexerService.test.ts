import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { memberIndexerService } from '../MemberIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listMembers', () => {
  it('excludes ragequit-to-zero members via shares>0 OR loot>0', async () => {
    const client = makeClient({ ds_members: { data: [{ id: 'm1' }], error: null } })
    holder.client = client
    const rows = await memberIndexerService.listMembers('dao-1')
    expect(rows).toEqual([{ id: 'm1' }])
    expect(client.queries[0].orArg()).toBe('shares.gt.0,loot.gt.0')
  })

  it('throws so an indexer outage is not shown as an empty roster', async () => {
    holder.client = makeClient({ ds_members: { data: null, error: { message: 'boom' } } })
    await expect(memberIndexerService.listMembers('dao-1')).rejects.toThrow(
      '[MemberIndexerService] listMembers: boom',
    )
  })
})

describe('getMember', () => {
  it('builds the composite key `${daoId}-${address.toLowerCase()}`', async () => {
    const client = makeClient({ ds_members: { data: { id: 'x' }, error: null } })
    holder.client = client
    await memberIndexerService.getMember('0xDAO', '0xMEMBER')
    expect(client.queries[0].eqArg('id')).toBe('0xDAO-0xmember')
    expect(client.queries[0].singled).toBe(true)
  })

  it('returns null for a non-member (the common isMember path)', async () => {
    holder.client = makeClient({ ds_members: { data: null, error: null } })
    expect(await memberIndexerService.getMember('0xDAO', '0xMEMBER')).toBeNull()
  })
})

describe('getActiveMemberCount', () => {
  it('returns the exact head-count of active members', async () => {
    const client = makeClient({ ds_members: { data: null, count: 42, error: null } })
    holder.client = client
    const count = await memberIndexerService.getActiveMemberCount('dao-1')
    expect(count).toBe(42)
    expect(client.queries[0].orArg()).toBe('shares.gt.0,loot.gt.0')
  })

  it('returns 0 (not null) when the count is missing', async () => {
    holder.client = makeClient({ ds_members: { data: null, count: null, error: null } })
    expect(await memberIndexerService.getActiveMemberCount('dao-1')).toBe(0)
  })

  it('returns 0 in direct-RPC mode without querying', async () => {
    holder.client = null
    expect(await memberIndexerService.getActiveMemberCount('dao-1')).toBe(0)
  })

  it('throws on a count query error', async () => {
    holder.client = makeClient({ ds_members: { data: null, count: null, error: { message: 'e' } } })
    await expect(memberIndexerService.getActiveMemberCount('dao-1')).rejects.toThrow(
      '[MemberIndexerService] getActiveMemberCount: e',
    )
  })
})

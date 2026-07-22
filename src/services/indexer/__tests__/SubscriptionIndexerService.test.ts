import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { subscriptionIndexerService } from '../SubscriptionIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listMembers', () => {
  it('orders soonest-to-lapse first (paid_through ascending) for the delinquency queue', async () => {
    const client = makeClient({ ds_subscription_members: { data: [], error: null } })
    holder.client = client
    await subscriptionIndexerService.listMembers('dao-1', '0xNAV')
    const q = client.queries[0]
    expect(q.orders).toContainEqual(['paid_through', { ascending: true }])
    expect(q.eqArg('navigator_address')).toBe('0xnav')
  })

  it('omits the navigator filter when none is given', async () => {
    const client = makeClient({ ds_subscription_members: { data: [], error: null } })
    holder.client = client
    await subscriptionIndexerService.listMembers('dao-1')
    expect(client.queries[0].eqArg('navigator_address')).toBeUndefined()
  })
})

describe('getMember', () => {
  it('composes the id from navigator + member, both lowercased', async () => {
    const client = makeClient({ ds_subscription_members: { data: { id: 'x' }, error: null } })
    holder.client = client
    await subscriptionIndexerService.getMember('0xNAV', '0xMEMBER')
    expect(client.queries[0].eqArg('id')).toBe('0xnav-0xmember')
    expect(client.queries[0].singled).toBe(true)
  })

  it('returns null when the wallet is not enrolled', async () => {
    holder.client = makeClient({ ds_subscription_members: { data: null, error: null } })
    expect(await subscriptionIndexerService.getMember('0xNAV', '0xMEMBER')).toBeNull()
  })
})

describe('listPayments', () => {
  it('filters by the member_pk composite (both lowercased), bounded to 25', async () => {
    const client = makeClient({ ds_subscription_payments: { data: [], error: null } })
    holder.client = client
    await subscriptionIndexerService.listPayments('0xNAV', '0xMEMBER')
    const q = client.queries[0]
    expect(q.eqArg('member_pk')).toBe('0xnav-0xmember')
    expect(q.limited).toBe(25)
  })
})

describe('listCollections', () => {
  it('filters by lowercased navigator, newest first, bounded to 25', async () => {
    const client = makeClient({ ds_subscription_collections: { data: [], error: null } })
    holder.client = client
    await subscriptionIndexerService.listCollections('0xNAV')
    const q = client.queries[0]
    expect(q.eqArg('navigator_address')).toBe('0xnav')
    expect(q.limited).toBe(25)
    expect(q.orders).toContainEqual(['block_number', { ascending: false }])
  })

  it('throws on a query error', async () => {
    holder.client = makeClient({
      ds_subscription_collections: { data: null, error: { message: 'e' } },
    })
    await expect(subscriptionIndexerService.listCollections('0xNAV')).rejects.toThrow(
      '[SubscriptionIndexerService] listCollections: e',
    )
  })
})

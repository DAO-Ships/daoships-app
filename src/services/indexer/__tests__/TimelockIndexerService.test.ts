import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { timelockIndexerService } from '../TimelockIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listChanges', () => {
  it('scopes to a lowercased navigator only when given, newest first', async () => {
    const client = makeClient({ ds_timelock_changes: { data: [], error: null } })
    holder.client = client
    await timelockIndexerService.listChanges('dao-1', '0xNAV')
    const q = client.queries[0]
    expect(q.eqArg('navigator_address')).toBe('0xnav')
    expect(q.orders).toContainEqual(['block_number', { ascending: false }])
  })

  it('omits the navigator filter when none is given', async () => {
    const client = makeClient({ ds_timelock_changes: { data: [], error: null } })
    holder.client = client
    await timelockIndexerService.listChanges('dao-1')
    expect(client.queries[0].eqArg('navigator_address')).toBeUndefined()
  })
})

describe('getChange', () => {
  it('composes the id `${navigator.toLowerCase()}-${changeId}` for the executeChange bytes', async () => {
    const client = makeClient({
      ds_timelock_changes: { data: { id: 'x', governance_config: '0xdead' }, error: null },
    })
    holder.client = client
    const change = await timelockIndexerService.getChange('0xNAV', '4')
    expect(change).toEqual({ id: 'x', governance_config: '0xdead' })
    expect(client.queries[0].eqArg('id')).toBe('0xnav-4')
    expect(client.queries[0].singled).toBe(true)
  })

  it('returns null when the change is not indexed', async () => {
    holder.client = makeClient({ ds_timelock_changes: { data: null, error: null } })
    expect(await timelockIndexerService.getChange('0xNAV', '4')).toBeNull()
  })
})

describe('listBypassedConfigChanges', () => {
  it('filters to bypassed_timelock=true — the trust warning feed', async () => {
    const client = makeClient({ ds_governance_config_history: { data: [], error: null } })
    holder.client = client
    await timelockIndexerService.listBypassedConfigChanges('dao-1')
    expect(client.queries[0].eqArg('bypassed_timelock')).toBe(true)
  })

  it('does NOT filter by bypassed_timelock in the full history query', async () => {
    const client = makeClient({ ds_governance_config_history: { data: [], error: null } })
    holder.client = client
    await timelockIndexerService.listConfigHistory('dao-1')
    expect(client.queries[0].eqArg('bypassed_timelock')).toBeUndefined()
  })

  it('throws on a query error', async () => {
    holder.client = makeClient({
      ds_governance_config_history: { data: null, error: { message: 'e' } },
    })
    await expect(timelockIndexerService.listBypassedConfigChanges('dao-1')).rejects.toThrow(
      '[TimelockIndexerService] listBypassedConfigChanges: e',
    )
  })
})

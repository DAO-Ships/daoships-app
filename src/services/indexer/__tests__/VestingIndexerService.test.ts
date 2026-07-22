import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { vestingIndexerService } from '../VestingIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listSchedules', () => {
  it('scopes to a lowercased navigator only when given', async () => {
    const client = makeClient({ ds_vesting_schedules: { data: [], error: null } })
    holder.client = client
    await vestingIndexerService.listSchedules('dao-1', '0xNAV')
    expect(client.queries[0].eqArg('navigator_address')).toBe('0xnav')
  })

  it('omits the navigator filter when none is given', async () => {
    const client = makeClient({ ds_vesting_schedules: { data: [], error: null } })
    holder.client = client
    await vestingIndexerService.listSchedules('dao-1')
    expect(client.queries[0].eqArg('navigator_address')).toBeUndefined()
  })
})

describe('listSchedulesForBeneficiary', () => {
  it('lowercases the beneficiary before filtering', async () => {
    const client = makeClient({ ds_vesting_schedules: { data: [], error: null } })
    holder.client = client
    await vestingIndexerService.listSchedulesForBeneficiary('dao-1', '0xBenefICIARY')
    const q = client.queries[0]
    expect(q.eqArg('beneficiary')).toBe('0xbeneficiary')
    expect(q.eqArg('dao_id')).toBe('dao-1')
  })
})

describe('getSchedule', () => {
  it('composes the id `${navigator.toLowerCase()}-${scheduleId}`', async () => {
    const client = makeClient({ ds_vesting_schedules: { data: { id: 'x' }, error: null } })
    holder.client = client
    const schedule = await vestingIndexerService.getSchedule('0xNAV', '2')
    expect(schedule).toEqual({ id: 'x' })
    expect(client.queries[0].eqArg('id')).toBe('0xnav-2')
    expect(client.queries[0].singled).toBe(true)
  })

  it('returns null when the schedule is not indexed yet', async () => {
    holder.client = makeClient({ ds_vesting_schedules: { data: null, error: null } })
    expect(await vestingIndexerService.getSchedule('0xNAV', '2')).toBeNull()
  })
})

describe('listClaims', () => {
  it('filters by navigator + schedule, bounded to 25 newest', async () => {
    const client = makeClient({ ds_vesting_claims: { data: [], error: null } })
    holder.client = client
    await vestingIndexerService.listClaims('0xNAV', '2')
    const q = client.queries[0]
    expect(q.eqArg('navigator_address')).toBe('0xnav')
    expect(q.eqArg('schedule_id')).toBe('2')
    expect(q.limited).toBe(25)
  })

  it('throws on a query error', async () => {
    holder.client = makeClient({ ds_vesting_claims: { data: null, error: { message: 'e' } } })
    await expect(vestingIndexerService.listClaims('0xNAV', '2')).rejects.toThrow(
      '[VestingIndexerService] listClaims: e',
    )
  })
})

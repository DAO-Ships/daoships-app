import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { daoIndexerService } from '../DaoIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listDaos', () => {
  it('does not apply an ilike filter when no search term is given', async () => {
    const client = makeClient({ ds_daos: { data: [{ id: '0x1' }], error: null } })
    holder.client = client
    const rows = await daoIndexerService.listDaos()
    expect(rows).toEqual([{ id: '0x1' }])
    expect(client.queries[0].ilikeArg('name')).toBeUndefined()
  })

  it('escapes LIKE wildcards in the search term so they are matched literally', async () => {
    const client = makeClient({ ds_daos: { data: [], error: null } })
    holder.client = client
    // A raw `%`/`_`/`\` in user input would otherwise act as a wildcard/escape.
    await daoIndexerService.listDaos('  50%_off\\ ')
    expect(client.queries[0].ilikeArg('name')).toBe('%50\\%\\_off\\\\%')
  })

  it('treats a whitespace-only search as no search', async () => {
    const client = makeClient({ ds_daos: { data: [], error: null } })
    holder.client = client
    await daoIndexerService.listDaos('   ')
    expect(client.queries[0].ilikeArg('name')).toBeUndefined()
  })

  it('returns [] in direct-RPC mode', async () => {
    holder.client = null
    expect(await daoIndexerService.listDaos()).toEqual([])
  })
})

describe('getDao', () => {
  it('lowercases the address id and reads a single row', async () => {
    const client = makeClient({ ds_daos: { data: { id: '0xabc' }, error: null } })
    holder.client = client
    const dao = await daoIndexerService.getDao('0xABC')
    expect(dao).toEqual({ id: '0xabc' })
    expect(client.queries[0].eqArg('id')).toBe('0xabc')
    expect(client.queries[0].singled).toBe(true)
  })

  it('returns null when the DAO does not exist', async () => {
    holder.client = makeClient({ ds_daos: { data: null, error: null } })
    expect(await daoIndexerService.getDao('0xABC')).toBeNull()
  })
})

describe('getDaosByMember', () => {
  it('resolves member dao_ids first, then fetches those DAOs by id', async () => {
    const client = makeClient({
      ds_members: { data: [{ dao_id: '0xd1' }, { dao_id: '0xd2' }], error: null },
      ds_daos: { data: [{ id: '0xd1' }, { id: '0xd2' }], error: null },
    })
    holder.client = client

    const daos = await daoIndexerService.getDaosByMember('0xMEMBER')

    const memberQuery = client.queries.find((q) => q.table === 'ds_members')!
    expect(memberQuery.eqArg('member_address')).toBe('0xmember')
    const daoQuery = client.queries.find((q) => q.table === 'ds_daos')!
    expect(daoQuery.inArg('id')).toEqual(['0xd1', '0xd2'])
    expect(daos).toHaveLength(2)
  })

  it('short-circuits without a second query when the address has no memberships', async () => {
    const client = makeClient({ ds_members: { data: [], error: null } })
    holder.client = client
    const daos = await daoIndexerService.getDaosByMember('0xMEMBER')
    expect(daos).toEqual([])
    expect(client.queries).toHaveLength(1) // never queried ds_daos
  })

  it('throws with the member-query context when the first query fails', async () => {
    holder.client = makeClient({
      ds_members: { data: null, error: { message: 'nope' } },
    })
    await expect(daoIndexerService.getDaosByMember('0xMEMBER')).rejects.toThrow(
      '[DaoIndexerService] getDaosByMember member query: nope',
    )
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { recordIndexerService } from '../RecordIndexerService'

beforeEach(() => {
  holder.client = null
  vi.restoreAllMocks()
})

describe('getDaoProfile', () => {
  it('accepts both profile tags and only verified trust levels, reading one row', async () => {
    const client = makeClient({ ds_records: { data: { id: 'p1' }, error: null } })
    holder.client = client

    const profile = await recordIndexerService.getDaoProfile('dao-1')

    expect(profile).toEqual({ id: 'p1' })
    const q = client.queries[0]
    expect(q.inArg('tag')).toEqual([
      'daoships.dao.profile.initial',
      'daoships.dao.profile',
    ])
    expect(q.inArg('trust_level')).toEqual(['VERIFIED', 'VERIFIED_INITIAL'])
    expect(q.singled).toBe(true)
  })

  it('returns null when no profile row exists (not an error)', async () => {
    holder.client = makeClient({ ds_records: { data: null, error: null } })
    expect(await recordIndexerService.getDaoProfile('dao-1')).toBeNull()
  })
})

describe('getMemberProfiles', () => {
  it('keeps the newest profile per member, lowercases keys, and skips null content', async () => {
    // Rows arrive newest-first (the query orders created_at desc). The second row for
    // the same member must be ignored, and a null content_json row dropped entirely.
    const client = makeClient({
      ds_records: {
        data: [
          { user_address: '0xAAA', content_json: { name: 'new' } },
          { user_address: '0xaaa', content_json: { name: 'stale' } },
          { user_address: '0xBBB', content_json: null },
          { user_address: '0xCCC', content_json: { name: 'carol' } },
        ],
        error: null,
      },
    })
    holder.client = client

    const profiles = await recordIndexerService.getMemberProfiles('dao-1')

    expect(profiles.get('0xaaa')).toEqual({ name: 'new' })
    expect(profiles.has('0xbbb')).toBe(false)
    expect(profiles.get('0xccc')).toEqual({ name: 'carol' })
    expect(profiles.size).toBe(2)
  })

  it('returns an empty map in direct-RPC mode', async () => {
    holder.client = null
    expect(await recordIndexerService.getMemberProfiles('dao-1')).toEqual(new Map())
  })
})

describe('getVoteReasons — impersonation guard', () => {
  const daoId = '0xDao000000000000000000000000000000000001'

  it('drops reasons whose author is not in the proposal voter set', async () => {
    const client = makeClient({
      ds_records: {
        data: [
          { user_address: '0xVOTED', content_json: {} },
          { user_address: '0xNEVERvoted', content_json: {} },
        ],
        error: null,
      },
      ds_votes: { data: [{ voter: '0xvoted' }], error: null },
    })
    holder.client = client

    const reasons = await recordIndexerService.getVoteReasons(daoId, 5)

    expect(reasons).toEqual([{ user_address: '0xVOTED', content_json: {} }])
  })

  it('cross-references votes by the lowercased composite proposal id', async () => {
    const client = makeClient({
      ds_records: { data: [], error: null },
      ds_votes: { data: [], error: null },
    })
    holder.client = client

    await recordIndexerService.getVoteReasons(daoId, 5)

    const votesQuery = client.queries.find((q) => q.table === 'ds_votes')!
    expect(votesQuery.eqArg('proposal_id')).toBe(`${daoId.toLowerCase()}-5`)
  })

  it('gracefully degrades to records-only when the votes cross-reference fails', async () => {
    // The votes query is a secondary check; its failure must NOT throw or drop all reasons.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = makeClient({
      ds_records: {
        data: [{ user_address: '0xANYONE', content_json: {} }],
        error: null,
      },
      ds_votes: { data: null, error: { message: 'votes table down' } },
    })
    holder.client = client

    const reasons = await recordIndexerService.getVoteReasons(daoId, 5)

    expect(reasons).toEqual([{ user_address: '0xANYONE', content_json: {} }])
    expect(warn).toHaveBeenCalled()
  })

  it('throws when the primary records query fails', async () => {
    const client = makeClient({
      ds_records: { data: null, error: { message: 'records down' } },
      ds_votes: { data: [], error: null },
    })
    holder.client = client

    await expect(recordIndexerService.getVoteReasons(daoId, 5)).rejects.toThrow(
      '[RecordIndexerService] getVoteReasons: records down',
    )
  })
})

describe('getNavigatorAllowlist — injection guard', () => {
  const validDao = '0x00000000000000000000000000000000000000aa'

  it('rejects a daoId that is not a strict hex address, without querying', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = makeClient({ ds_records: { data: [], error: null } })
    holder.client = client

    const result = await recordIndexerService.getNavigatorAllowlist(
      "0xabc,dao_id.eq.evil'--",
      '0xnav',
    )

    expect(result).toBeNull()
    expect(client.queries).toHaveLength(0) // never reached the indexer
    expect(err).toHaveBeenCalled()
  })

  it('includes orphaned (null dao_id) records via the .or() filter', async () => {
    const client = makeClient({
      ds_records: {
        data: [{ content_json: { navigatorAddress: '0xNAV' } }],
        error: null,
      },
    })
    holder.client = client

    await recordIndexerService.getNavigatorAllowlist(validDao, '0xNAV')

    expect(client.queries[0].orArg()).toBe(`dao_id.eq.${validDao.toLowerCase()},dao_id.is.null`)
  })

  it('re-checks navigator casing client-side and returns the match', async () => {
    const client = makeClient({
      ds_records: {
        data: [
          { content_json: { navigatorAddress: '0xOTHER' } },
          { content_json: { navigatorAddress: '0xNaV' } },
        ],
        error: null,
      },
    })
    holder.client = client

    const result = await recordIndexerService.getNavigatorAllowlist(validDao, '0xnav')

    expect(result).toEqual({ content_json: { navigatorAddress: '0xNaV' } })
  })

  it('returns null when no stored record matches the navigator', async () => {
    holder.client = makeClient({
      ds_records: { data: [{ content_json: { navigatorAddress: '0xother' } }], error: null },
    })
    expect(await recordIndexerService.getNavigatorAllowlist(validDao, '0xnav')).toBeNull()
  })
})

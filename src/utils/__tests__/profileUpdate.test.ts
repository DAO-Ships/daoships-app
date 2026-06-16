import { describe, it, expect } from 'vitest'
import { buildProfileUpdate } from '../profileUpdate'

const DAO = '0x00abc'

describe('buildProfileUpdate', () => {
  it('returns null when nothing changed', () => {
    expect(buildProfileUpdate(DAO, { name: 'A' }, { name: 'A' })).toBeNull()
  })

  it('diffs a plain field', () => {
    expect(buildProfileUpdate(DAO, { name: 'A' }, { name: 'B' })).toEqual({ daoAddress: DAO, name: 'B' })
  })

  it('includes a newly added banner and theme', () => {
    const out = buildProfileUpdate(DAO, { name: 'A' }, { name: 'A', banner: 'https://x/b.png', theme: { primary: '#6257c9' } })
    expect(out).toEqual({ daoAddress: DAO, banner: 'https://x/b.png', theme: { primary: '#6257c9' } })
  })

  // The reported bug: clearing a banner/theme as the ONLY change used to yield an empty
  // payload → "no changes" → confirm dialog/wallet never opened. Must now send null to clear.
  it('clears a removed banner (sole change) with null — not an empty payload', () => {
    const out = buildProfileUpdate(DAO, { name: 'A', banner: 'https://x/b.png' }, { name: 'A', banner: '' })
    expect(out).not.toBeNull()
    expect(out).toEqual({ daoAddress: DAO, banner: null })
  })

  it('clears a removed theme (sole change) with null', () => {
    const out = buildProfileUpdate(DAO, { name: 'A', theme: { primary: '#6257c9' } }, { name: 'A', theme: {} })
    expect(out).not.toBeNull()
    expect(out).toEqual({ daoAddress: DAO, theme: null })
  })

  it('carries forward unchanged banner/theme on an unrelated change (content_json would otherwise drop them)', () => {
    const cur = { name: 'A', banner: 'https://x/b.png', theme: { primary: '#6257c9' } }
    const next = { name: 'B', banner: 'https://x/b.png', theme: { primary: '#6257c9' } }
    const out = buildProfileUpdate(DAO, cur, next)
    expect(out).toEqual({ daoAddress: DAO, name: 'B', banner: 'https://x/b.png', theme: { primary: '#6257c9' } })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Phase A: wire validatePosterContent before spending gas.
//
// The size guard was already enforced, but the schema validator was dead code.
// A post that fails the indexer's validation still costs gas and still mines —
// the user sees a confirmed transaction and metadata that never appears.
//
// Gated on hasPosterSchema(): daoships.dao.navigators and daoships.signal.poll
// have no entry in POSTER_SCHEMAS (the latter is validated by
// validateSignalPollLabels instead), and validatePosterContent reports an
// unschema'd tag as invalid — so validating them here would reject valid posts.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POSTER_TAGS } from '@/types/poster'
import { hasPosterSchema, validatePosterContent } from '@/utils/posterSchemas'

const postMock = vi.fn()

vi.mock('@/services/core/BaseService.ts', () => ({
  baseService: {
    requireSigner: () => ({ getAddress: async () => '0x00' }),
    hasProvider: () => true,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  postMock.mockResolvedValue({ hash: '0xabc', wait: async () => ({ status: 1 }) })
})

describe('hasPosterSchema — the gate that keeps unschema\'d tags postable', () => {
  it('reports schemas for the six tags that have them', () => {
    for (const tag of [
      POSTER_TAGS.DAO_PROFILE_INITIAL,
      POSTER_TAGS.DAO_PROFILE,
      POSTER_TAGS.DAO_ANNOUNCEMENT,
      POSTER_TAGS.MEMBER_PROFILE,
      POSTER_TAGS.PROPOSAL_VOTE_REASON,
      POSTER_TAGS.NAVIGATOR_ALLOWLIST,
    ]) {
      expect(hasPosterSchema(tag)).toBe(true)
    }
  })

  it('reports no schema for the two tags validated elsewhere', () => {
    // Validating these with validatePosterContent would reject them outright.
    expect(hasPosterSchema(POSTER_TAGS.DAO_NAVIGATORS)).toBe(false)
    expect(hasPosterSchema(POSTER_TAGS.SIGNAL_POLL)).toBe(false)
  })
})

describe('validatePosterContent — the cases that cost real gas today', () => {
  const v = '1.0'

  it('rejects an initial profile with an empty description, matching the indexer', () => {
    // daoships-indexer validateDaoProfileInitial:
    //   if (!daoAddress || !name || !description) return null
    // The launch form defaults description to '' (validation.ts: .optional().default('')),
    // so every description-less launch posted a record discarded on arrival.
    const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE_INITIAL, {
      schemaVersion: v,
      daoAddress: '0x00aa',
      name: 'My DAO',
      description: '',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/description is required/)
  })

  it('accepts an initial profile that carries a description', () => {
    const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE_INITIAL, {
      schemaVersion: v,
      daoAddress: '0x00aa',
      name: 'My DAO',
      description: 'A real description',
    })
    expect(result.valid).toBe(true)
  })

  it('allows a partial dao.profile update with a null description', () => {
    // dao.profile requires only daoAddress — it supports partial updates, and
    // optional fields that are null/undefined/'' are skipped rather than rejected.
    // Wiring validation must not break this path.
    const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
      schemaVersion: v,
      daoAddress: '0x00aa',
      description: null,
      name: undefined,
    })
    expect(result.valid).toBe(true)
  })

  it('requires schemaVersion on every post', () => {
    const result = validatePosterContent(POSTER_TAGS.MEMBER_PROFILE, { name: 'Ada' })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/schemaVersion is required/)
  })

  it('rejects over-length fields before they reach the chain', () => {
    const result = validatePosterContent(POSTER_TAGS.PROPOSAL_VOTE_REASON, {
      schemaVersion: v,
      daoAddress: '0x00aa',
      reason: 'x'.repeat(501),
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/500 characters or fewer/)
  })

  it('rejects a non-http/ipfs avatar URL', () => {
    const result = validatePosterContent(POSTER_TAGS.MEMBER_PROFILE, {
      schemaVersion: v,
      name: 'Ada',
      avatar: 'javascript:alert(1)',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/valid URL/)
  })

  it('ignores extra fields the schema does not declare', () => {
    // theme, links and tags are carried by the profile payload but are not in
    // POSTER_SCHEMAS; they must not trip validation.
    const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE_INITIAL, {
      schemaVersion: v,
      daoAddress: '0x00aa',
      name: 'My DAO',
      description: 'Real',
      theme: { primary: '#abc' },
      links: { website: 'https://example.com' },
      tags: ['defi'],
    })
    expect(result.valid).toBe(true)
  })
})

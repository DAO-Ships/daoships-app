import { describe, it, expect } from 'vitest'
import { validatePosterContent, validateSignalPollLabels } from '@/utils/posterSchemas'
import { POSTER_TAGS } from '@/types/poster'

describe('validatePosterContent', () => {
  // All valid payloads include schemaVersion (required by validator)
  const V = '1.0'

  describe('daoships.dao.profile', () => {
    it('accepts a valid profile payload', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test DAO',
        description: 'A test DAO',
        avatar: 'https://example.com/avatar.png',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts partial profile (only daoAddress + schemaVersion)', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects missing required daoAddress', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        name: 'Test DAO',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('daoAddress is required')
    })

    it('rejects missing schemaVersion', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test DAO',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('schemaVersion is required')
    })

    it('enforces name length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'x'.repeat(65),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('64 characters'))).toBe(true)
    })

    it('enforces description length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test',
        description: 'x'.repeat(281),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('280 characters'))).toBe(true)
    })

    it('rejects invalid URL schemes in avatar', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test',
        avatar: 'javascript:alert(1)',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('avatar'))).toBe(true)
    })

    it('accepts ipfs URLs for avatar', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test',
        avatar: 'ipfs://QmTest123',
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('daoships.dao.profile.initial', () => {
    it('accepts a valid initial profile', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE_INITIAL, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'New DAO',
        description: 'Just launched',
        avatar: 'https://example.com/logo.png',
      })
      expect(result.valid).toBe(true)
    })

    it('rejects missing required name on initial', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE_INITIAL, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        description: 'Just launched',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required')
    })
  })

  describe('daoships.dao.announcement', () => {
    it('accepts a valid announcement payload', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        title: 'Big News',
        body: 'We have an important announcement.',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects announcement missing title', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('title is required')
    })

    it('rejects missing required daoAddress', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        schemaVersion: V,
        title: 'Title',
        body: 'Body',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('daoAddress is required')
    })

    it('enforces title length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        title: 'x'.repeat(101),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('100 characters'))).toBe(true)
    })

    it('enforces body length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        schemaVersion: V,
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        title: 'Test',
        body: 'x'.repeat(501),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('500 characters'))).toBe(true)
    })
  })

  describe('unknown tags', () => {
    it('rejects unknown poster tags', () => {
      const result = validatePosterContent('unknown.tag', { foo: 'bar' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Unknown poster tag: unknown.tag')
    })
  })
})

describe('validateSignalPollLabels', () => {
  it('accepts valid options with optional description and discussion link', () => {
    const result = validateSignalPollLabels({
      options: ['Teal', 'Magenta', 'Slate'],
      description: 'Pick the v2 brand color.',
      discussionUrl: 'https://forum.mydao.xyz/t/brand-color/789',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('accepts options-only (no description/link)', () => {
    const result = validateSignalPollLabels({ options: ['Yes', 'No'] })
    expect(result.valid).toBe(true)
  })

  it('accepts an ipfs discussion link', () => {
    const result = validateSignalPollLabels({ options: ['Yes', 'No'], discussionUrl: 'ipfs://QmTest123' })
    expect(result.valid).toBe(true)
  })

  it('rejects non-array options', () => {
    const result = validateSignalPollLabels({ options: 'Yes,No' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('must be an array'))).toBe(true)
  })

  it('rejects fewer than 2 options', () => {
    const result = validateSignalPollLabels({ options: ['Only one'] })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('between 2 and 10'))).toBe(true)
  })

  it('rejects more than 10 options', () => {
    const result = validateSignalPollLabels({ options: Array.from({ length: 11 }, (_, i) => `Opt ${i}`) })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('between 2 and 10'))).toBe(true)
  })

  it('rejects an empty/whitespace option label', () => {
    const result = validateSignalPollLabels({ options: ['Yes', '   '] })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('option 2 must be a non-empty label'))).toBe(true)
  })

  it('enforces the 200-char option label limit', () => {
    const result = validateSignalPollLabels({ options: ['Yes', 'x'.repeat(201)] })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('200 characters'))).toBe(true)
  })

  it('enforces the 1000-char description limit', () => {
    const result = validateSignalPollLabels({ options: ['Yes', 'No'], description: 'x'.repeat(1001) })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('1000 characters'))).toBe(true)
  })

  it('rejects a dangerous discussion URL scheme', () => {
    const result = validateSignalPollLabels({ options: ['Yes', 'No'], discussionUrl: 'javascript:alert(1)' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('discussionUrl'))).toBe(true)
  })
})

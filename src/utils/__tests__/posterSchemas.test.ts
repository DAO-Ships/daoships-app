import { describe, it, expect } from 'vitest'
import { validatePosterContent } from '@/utils/posterSchemas'
import { POSTER_TAGS } from '@/types/poster'

describe('validatePosterContent', () => {
  describe('daoships.dao.profile', () => {
    it('accepts a valid profile payload', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test DAO',
        description: 'A test DAO',
        avatar: 'https://example.com/avatar.png',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts minimal profile (only required fields)', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test DAO',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects missing required daoAddress', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        name: 'Test DAO',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('daoAddress is required')
    })

    it('rejects missing required name field', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        description: 'A test DAO',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required')
    })

    it('rejects empty required name field', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: '',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required')
    })

    it('enforces name length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'x'.repeat(121),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('120 characters'))).toBe(true)
    })

    it('enforces description length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test',
        description: 'x'.repeat(2001),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('2000 characters'))).toBe(true)
    })

    it('rejects invalid URL schemes in avatar', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'Test',
        avatar: 'javascript:alert(1)',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('avatar'))).toBe(true)
    })

    it('accepts ipfs URLs for avatar', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_PROFILE, {
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
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        name: 'New DAO',
        description: 'Just launched',
        avatar: 'https://example.com/logo.png',
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('daoships.dao.announcement', () => {
    it('accepts a valid announcement payload', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        title: 'Big News',
        body: 'We have an important announcement.',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts announcement with only daoAddress', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
      })
      expect(result.valid).toBe(true)
    })

    it('rejects missing required daoAddress', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        title: 'Title',
        body: 'Body',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('daoAddress is required')
    })

    it('enforces title length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        title: 'x'.repeat(241),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('240 characters'))).toBe(true)
    })

    it('enforces body length limit', () => {
      const result = validatePosterContent(POSTER_TAGS.DAO_ANNOUNCEMENT, {
        daoAddress: '0x001234567890abcdef1234567890abcdef123456',
        body: 'x'.repeat(5001),
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('5000 characters'))).toBe(true)
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

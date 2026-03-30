import { describe, it, expect } from 'vitest'
import { isValidUrl, resolveUrl, safeHref } from '@/utils/url'

describe('isValidUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true)
  })

  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true)
  })

  it('accepts ipfs URLs', () => {
    expect(isValidUrl('ipfs://QmTest123abc')).toBe(true)
  })

  it('rejects javascript: scheme', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects data: scheme', () => {
    expect(isValidUrl('data:text/html,<h1>hi</h1>')).toBe(false)
  })

  it('rejects blob: scheme', () => {
    expect(isValidUrl('blob:https://example.com/uuid')).toBe(false)
  })

  it('rejects vbscript: scheme', () => {
    expect(isValidUrl('vbscript:msgbox("xss")')).toBe(false)
  })

  it('rejects case-varied dangerous schemes', () => {
    expect(isValidUrl('JavaScript:alert(1)')).toBe(false)
    expect(isValidUrl('JAVASCRIPT:alert(1)')).toBe(false)
    expect(isValidUrl('Data:text/html,test')).toBe(false)
    expect(isValidUrl('VBSCRIPT:test')).toBe(false)
    expect(isValidUrl('Blob:test')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidUrl(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isValidUrl(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('   ')).toBe(false)
  })

  it('rejects strings without a valid scheme', () => {
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl('ftp://files.example.com')).toBe(false)
  })
})

describe('resolveUrl', () => {
  it('converts ipfs:// to gateway URL', () => {
    const result = resolveUrl('ipfs://QmTest123abc')
    expect(result).toBe('https://gateway.pinata.cloud/ipfs/QmTest123abc')
  })

  it('handles case-insensitive ipfs scheme', () => {
    const result = resolveUrl('IPFS://QmTest123abc')
    expect(result).toBe('https://gateway.pinata.cloud/ipfs/QmTest123abc')
  })

  it('returns https URLs as-is', () => {
    const url = 'https://example.com/image.png'
    expect(resolveUrl(url)).toBe(url)
  })

  it('returns http URLs as-is', () => {
    const url = 'http://example.com/image.png'
    expect(resolveUrl(url)).toBe(url)
  })

  it('trims whitespace', () => {
    expect(resolveUrl('  https://example.com  ')).toBe('https://example.com')
  })
})

describe('safeHref', () => {
  it('returns the URL for safe https URLs', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
  })

  it('returns # for javascript: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#')
  })

  it('returns # for data: URLs', () => {
    expect(safeHref('data:text/html,test')).toBe('#')
  })

  it('returns # for null', () => {
    expect(safeHref(null)).toBe('#')
  })

  it('returns # for undefined', () => {
    expect(safeHref(undefined)).toBe('#')
  })

  it('returns # for empty string', () => {
    expect(safeHref('')).toBe('#')
    expect(safeHref('   ')).toBe('#')
  })

  it('returns # for case-varied dangerous schemes', () => {
    expect(safeHref('JavaScript:void(0)')).toBe('#')
    expect(safeHref('BLOB:test')).toBe('#')
  })

  // Allowlist enforcement — non-allowed schemes return '#'
  it('returns # for mailto: URLs', () => {
    expect(safeHref('mailto:test@evil.com')).toBe('#')
  })

  it('returns # for ftp: URLs', () => {
    expect(safeHref('ftp://files.example.com')).toBe('#')
  })

  it('returns # for tel: URLs', () => {
    expect(safeHref('tel:+1234567890')).toBe('#')
  })

  it('returns # for file: URLs', () => {
    expect(safeHref('file:///etc/passwd')).toBe('#')
  })

  it('returns # for protocol-relative URLs', () => {
    expect(safeHref('//evil.com/phish')).toBe('#')
  })

  it('resolves ipfs:// to a gateway URL', () => {
    const result = safeHref('ipfs://QmTest123')
    expect(result).not.toBe('#')
    expect(result).not.toBe('ipfs://QmTest123')
    expect(result).toContain('QmTest123')
    expect(result).toMatch(/^https?:\/\//)
  })
})

describe('resolveUrl IPFS sanitization', () => {
  it('blocks path traversal with raw ../', () => {
    expect(resolveUrl('ipfs://../../etc/passwd')).toBeNull()
  })

  it('blocks URL-encoded path traversal', () => {
    expect(resolveUrl('ipfs://%2e%2e/etc')).toBeNull()
  })

  it('returns null for empty CID', () => {
    expect(resolveUrl('ipfs://')).toBeNull()
  })

  it('resolves valid CID to gateway URL with encoded CID', () => {
    const result = resolveUrl('ipfs://QmValidCid123')
    expect(result).not.toBeNull()
    expect(result).toContain('QmValidCid123')
    expect(result).toMatch(/^https?:\/\//)
  })
})

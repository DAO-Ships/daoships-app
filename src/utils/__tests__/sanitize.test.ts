import { describe, it, expect } from 'vitest'
import { sanitizeHtml, stripHtml } from '@/utils/sanitize'

describe('sanitizeHtml', () => {
  it('allows permitted tags (p, strong, a, img)', () => {
    const input = '<p>Hello <strong>world</strong></p>'
    const result = sanitizeHtml(input)
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
    expect(result).toContain('world')
  })

  it('allows em, b, i, u tags', () => {
    const input = '<em>italic</em> <b>bold</b> <i>also italic</i> <u>underline</u>'
    const result = sanitizeHtml(input)
    expect(result).toContain('<em>')
    expect(result).toContain('<b>')
    expect(result).toContain('<i>')
    expect(result).toContain('<u>')
  })

  it('allows list tags', () => {
    const input = '<ul><li>item 1</li><li>item 2</li></ul>'
    const result = sanitizeHtml(input)
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
  })

  it('strips script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('Hello')
  })

  it('strips event handlers (onerror)', () => {
    const input = '<img src="https://example.com/img.png" onerror="alert(1)">'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('alert')
  })

  it('strips javascript: URLs from hrefs', () => {
    const input = '<a href="javascript:alert(1)">click</a>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('javascript:')
  })

  it('strips data: URLs from img src', () => {
    const input = '<img src="data:image/svg+xml,<svg onload=alert(1)>">'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('data:')
  })

  it('allows https img src', () => {
    const input = '<img src="https://example.com/image.png" alt="test">'
    const result = sanitizeHtml(input)
    expect(result).toContain('https://example.com/image.png')
  })

  it('allows ipfs img src', () => {
    const input = '<img src="ipfs://QmTest123" alt="test">'
    const result = sanitizeHtml(input)
    expect(result).toContain('ipfs://QmTest123')
  })

  it('adds target="_blank" and rel="noopener noreferrer" to links', () => {
    const input = '<a href="https://example.com">link</a>'
    const result = sanitizeHtml(input)
    expect(result).toContain('target="_blank"')
    expect(result).toContain('rel="noopener noreferrer"')
  })

  it('strips iframe tags', () => {
    const input = '<iframe src="https://evil.com"></iframe>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<iframe')
  })

  it('strips form tags', () => {
    const input = '<form action="https://evil.com"><input type="text"></form>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<form')
  })

  it('strips object tags', () => {
    const input = '<object data="evil.swf"></object>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<object')
  })

  it('strips embed tags', () => {
    const input = '<embed src="evil.swf">'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<embed')
  })
})

describe('stripHtml', () => {
  it('removes all HTML tags and returns plain text', () => {
    const input = '<p>Hello <strong>world</strong></p>'
    const result = stripHtml(input)
    expect(result).toBe('Hello world')
  })

  it('removes nested tags', () => {
    const input = '<div><p>Text <a href="https://example.com">link</a></p></div>'
    const result = stripHtml(input)
    expect(result).toBe('Text link')
  })

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('strips script content', () => {
    const input = '<script>alert("xss")</script>Safe text'
    const result = stripHtml(input)
    expect(result).not.toContain('alert')
    expect(result).toContain('Safe text')
  })
})

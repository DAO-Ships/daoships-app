import { markUntrusted } from '@/types/untrusted'
import { describe, it, expect } from 'vitest'
import {
  formatTokenAmount,
  parseTokenAmount,
  parseProposalDetails,
  formatNumber,
  formatCompactNumber,
} from '@/utils/format'

describe('formatTokenAmount', () => {
  it('formats 1 token (1e18) with default decimals', () => {
    const result = formatTokenAmount(1000000000000000000n)
    expect(result).toBe('1.000')
  })

  it('formats zero', () => {
    const result = formatTokenAmount(0n)
    expect(result).toBe('0.000')
  })

  it('formats fractional amounts', () => {
    // 0.5 token = 5e17
    const result = formatTokenAmount(500000000000000000n)
    expect(result).toBe('0.500')
  })

  it('formats large numbers', () => {
    // 1,000,000 tokens
    const result = formatTokenAmount(1000000n * 10n ** 18n)
    expect(result).toBe('1000000.000')
  })

  it('truncates to maxDecimals', () => {
    // 1.123456789... token
    const result = formatTokenAmount(1123456789012345678n, 18, 4, 3)
    expect(result).toMatch(/^1\.1234/)
  })

  it('respects minDecimals for trailing zeros', () => {
    // Exact 1.1 token = 1100000000000000000
    const result = formatTokenAmount(1100000000000000000n, 18, 4, 3)
    expect(result).toBe('1.100')
  })

  it('handles custom decimals (6 for USDC)', () => {
    const result = formatTokenAmount(1000000n, 6, 4, 2)
    expect(result).toBe('1.00')
  })

  it('formats without min decimals', () => {
    const result = formatTokenAmount(1000000000000000000n, 18, 4, 0)
    expect(result).toBe('1')
  })
})

describe('parseTokenAmount', () => {
  it('parses "1" to 1e18', () => {
    expect(parseTokenAmount('1')).toBe(1000000000000000000n)
  })

  it('parses "0" to 0n', () => {
    expect(parseTokenAmount('0')).toBe(0n)
  })

  it('parses "1.5" correctly', () => {
    expect(parseTokenAmount('1.5')).toBe(1500000000000000000n)
  })

  it('parses empty string to 0n', () => {
    expect(parseTokenAmount('')).toBe(0n)
  })

  it('parses "." to 0n', () => {
    expect(parseTokenAmount('.')).toBe(0n)
  })

  it('trims whitespace', () => {
    expect(parseTokenAmount('  1  ')).toBe(1000000000000000000n)
  })

  it('handles custom decimals (6)', () => {
    expect(parseTokenAmount('1', 6)).toBe(1000000n)
    expect(parseTokenAmount('1.5', 6)).toBe(1500000n)
  })

  it('truncates excess fractional digits', () => {
    // More than 18 decimal digits - should truncate
    const result = parseTokenAmount('1.1234567890123456789999', 18)
    expect(result).toBe(1123456789012345678n)
  })
})

describe('parseProposalDetails', () => {
  it('parses valid JSON with title and description', () => {
    const json = JSON.stringify({ title: 'My Proposal', description: 'Details here' })
    const result = parseProposalDetails(markUntrusted(json))
    expect(result.title).toBe('My Proposal')
    expect(result.description).toBe('Details here')
  })

  it('returns defaults for null input', () => {
    const result = parseProposalDetails(null)
    expect(result.title).toBe('Untitled Proposal')
    expect(result.description).toBe('')
  })

  it('uses first line as title for plain text', () => {
    const result = parseProposalDetails(markUntrusted('First line\nSecond line'))
    expect(result.title).toBe('First line')
    expect(result.description).toBe('First line\nSecond line')
  })

  it('handles JSON missing title', () => {
    const json = JSON.stringify({ description: 'Only description' })
    const result = parseProposalDetails(markUntrusted(json))
    expect(result.title).toBe('Untitled Proposal')
    expect(result.description).toBe('Only description')
  })
})

describe('formatNumber', () => {
  it('formats thousands with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('formats small numbers without commas', () => {
    expect(formatNumber(42)).toBe('42')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatCompactNumber', () => {
  it('returns as-is for numbers under 1000', () => {
    expect(formatCompactNumber(42)).toBe('42')
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('formats thousands as K', () => {
    expect(formatCompactNumber(1000)).toBe('1K')
    expect(formatCompactNumber(1500)).toBe('1.5K')
    expect(formatCompactNumber(12345)).toBe('12.3K')
  })

  it('formats millions as M', () => {
    expect(formatCompactNumber(1000000)).toBe('1M')
    expect(formatCompactNumber(2500000)).toBe('2.5M')
  })

  it('formats billions as B', () => {
    expect(formatCompactNumber(1000000000)).toBe('1B')
  })

  it('formats trillions as T', () => {
    expect(formatCompactNumber(1000000000000)).toBe('1T')
  })

  it('handles zero', () => {
    expect(formatCompactNumber(0)).toBe('0')
  })

  it('handles negative numbers', () => {
    expect(formatCompactNumber(-1500)).toBe('-1.5K')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C4: ds_proposals.details is attacker-authored — submitProposal is external
// payable with no membership check, so any funded address can write these.
// The parser validates SHAPE only; the contents stay hostile and stay marked.
// ─────────────────────────────────────────────────────────────────────────────
describe('parseProposalDetails — hostile input', () => {
  it('passes script-like text through unchanged rather than half-sanitising it', () => {
    // Escaping belongs at the render boundary (React does it). A parser that
    // silently rewrote content would give a false sense of safety here.
    const payload = '<img src=x onerror=alert(1)>'
    const r = parseProposalDetails(markUntrusted(JSON.stringify({ title: payload, description: payload })))
    expect(r.title).toBe(payload)
    expect(r.description).toBe(payload)
  })

  it('rejects a non-http(s) discussionUrl', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      const r = parseProposalDetails(markUntrusted(JSON.stringify({ title: 't', discussionUrl: url })))
      expect(r.discussionUrl, url).toBeUndefined()
    }
  })

  it('keeps a valid https discussionUrl', () => {
    const r = parseProposalDetails(markUntrusted(JSON.stringify({ title: 't', discussionUrl: 'https://example.com/x' })))
    expect(r.discussionUrl).toBe('https://example.com/x')
  })

  it('never returns a non-string for a field JSX will render', () => {
    // `Objects are not valid as a React child` crashes the whole proposal list,
    // so a hostile object/array/number must not reach the caller as-is.
    const r = parseProposalDetails(markUntrusted(JSON.stringify({
      title: { evil: true }, description: [1, 2], type: 42,
    })))
    expect(typeof r.title).toBe('string')
    expect(typeof r.description).toBe('string')
    expect(r.type).toBeUndefined()
  })

  it('falls back to a placeholder title for whitespace-only input', () => {
    const r = parseProposalDetails(markUntrusted(JSON.stringify({ title: '   ' })))
    expect(r.title).toBe('Untitled Proposal')
  })

  it('treats unparseable text as plain text without throwing', () => {
    const r = parseProposalDetails(markUntrusted('{not json at all'))
    expect(r.title).toBe('{not json at all')
  })
})

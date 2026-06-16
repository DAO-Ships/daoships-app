import { describe, it, expect } from 'vitest'
import { parseHex, contrast, generateRamp, extractTheme, buildThemeVars } from '../daoTheme'

describe('parseHex', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(parseHex('#7f77dd')).toEqual([127, 119, 221])
    expect(parseHex('#fff')).toEqual([255, 255, 255])
  })
  it('rejects non-strict-hex (injection / named / functional)', () => {
    expect(parseHex('red')).toBeNull()
    expect(parseHex('rgb(0,0,0)')).toBeNull()
    expect(parseHex('#fff; } body { background: url(//evil) }')).toBeNull()
    expect(parseHex('#12')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
})

describe('contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0)
    expect(contrast([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 0)
  })
})

describe('generateRamp', () => {
  it('produces 11 stops, base at 500, lighter→darker monotonic', () => {
    const ramp = generateRamp([127, 119, 221])
    expect(Object.keys(ramp).length).toBe(11)
    expect(ramp[500]).toEqual([127, 119, 221])
    // 50 is lightest, 950 is darkest
    expect(ramp[50][0]).toBeGreaterThan(ramp[950][0])
  })
})

describe('extractTheme (defense-in-depth re-validation)', () => {
  it('keeps only strict-hex colors + literal mode, drops everything else', () => {
    const theme = extractTheme({
      theme: {
        primary: '#5B8DEF',
        secondary: '#fff; } body { background: url(x) }', // injection → dropped
        accent: 'red', // named → dropped
        background: 'rgb(0,0,0)', // functional → dropped
        surface: '#12', // wrong length → dropped
        text: '#ffffff',
        mode: 'dark',
        evilKey: '#000', // unknown key → dropped
      },
    })
    expect(theme).toEqual({ primary: '#5B8DEF', text: '#ffffff', mode: 'dark' })
  })
  it('returns null when no usable color survives', () => {
    expect(extractTheme({ theme: { primary: 'red', mode: 'dark' } })).toBeNull()
    expect(extractTheme({ theme: {} })).toBeNull()
    expect(extractTheme({})).toBeNull()
    expect(extractTheme(null)).toBeNull()
  })
})

describe('buildThemeVars (contrast guards)', () => {
  it('applies a legible primary ramp', () => {
    const vars = buildThemeVars({ primary: '#4f46e5' }, true)
    expect(vars['--primary-500']).toBeDefined()
    expect(vars['--primary-600']).toBeDefined()
  })
  it('drops a primary too light for white button text', () => {
    // pale yellow → white-on-600 fails AA → primary skipped entirely
    const vars = buildThemeVars({ primary: '#fff9c4' }, true)
    expect(vars['--primary-500']).toBeUndefined()
  })
  it('applies background+text only as a passing pair', () => {
    const ok = buildThemeVars({ background: '#0a0a12', text: '#f3f4f6' }, true)
    expect(ok['--dao-bg-1']).toBe('#0a0a12')
    expect(ok['--dao-text']).toBe('#f3f4f6')
    // a failing pair (light text on light bg) is dropped wholesale
    const bad = buildThemeVars({ background: '#fefefe', text: '#f0f0f0' }, false)
    expect(bad['--dao-bg-1']).toBeUndefined()
    expect(bad['--dao-text']).toBeUndefined()
  })
  it('never sets bg/text from a lone token (needs the pair)', () => {
    const vars = buildThemeVars({ background: '#0a0a12' }, true)
    expect(vars['--dao-bg-1']).toBeUndefined()
  })
})

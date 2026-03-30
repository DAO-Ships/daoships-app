import { describe, it, expect } from 'vitest'
import { safeJsonParse, safeString, safeEntries } from '@/utils/contentJson'

describe('safeJsonParse', () => {
  it('parses valid JSON objects', () => {
    const result = safeJsonParse('{"name":"test","value":42}')
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('parses nested objects', () => {
    const result = safeJsonParse('{"a":{"b":"c"}}')
    expect(result).toEqual({ a: { b: 'c' } })
  })

  it('returns null for arrays', () => {
    expect(safeJsonParse('[1,2,3]')).toBeNull()
    expect(safeJsonParse('[]')).toBeNull()
  })

  it('returns null for primitive JSON values', () => {
    expect(safeJsonParse('"hello"')).toBeNull()
    expect(safeJsonParse('42')).toBeNull()
    expect(safeJsonParse('true')).toBeNull()
    expect(safeJsonParse('null')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('{invalid}')).toBeNull()
    expect(safeJsonParse('not json at all')).toBeNull()
    expect(safeJsonParse('')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(safeJsonParse(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(safeJsonParse(undefined)).toBeNull()
  })
})

describe('safeString', () => {
  it('extracts string fields', () => {
    const obj = { name: 'Alice', age: 30 }
    expect(safeString(obj, 'name')).toBe('Alice')
  })

  it('returns fallback for missing fields', () => {
    const obj = { name: 'Alice' }
    expect(safeString(obj, 'missing')).toBe('')
  })

  it('returns fallback for non-string fields', () => {
    const obj = { count: 42, flag: true, nested: { a: 1 } }
    expect(safeString(obj, 'count')).toBe('')
    expect(safeString(obj, 'flag')).toBe('')
    expect(safeString(obj, 'nested')).toBe('')
  })

  it('uses custom fallback', () => {
    const obj = { name: 'Alice' }
    expect(safeString(obj, 'missing', 'default')).toBe('default')
  })

  it('returns fallback for null object', () => {
    expect(safeString(null, 'key')).toBe('')
    expect(safeString(null, 'key', 'fallback')).toBe('fallback')
  })

  it('returns fallback for undefined object', () => {
    expect(safeString(undefined, 'key')).toBe('')
  })
})

describe('safeEntries', () => {
  it('returns entries for valid objects', () => {
    const obj = { a: 1, b: 'two', c: true }
    const entries = safeEntries(obj)
    expect(entries).toEqual([
      ['a', 1],
      ['b', 'two'],
      ['c', true],
    ])
  })

  it('returns empty array for null', () => {
    expect(safeEntries(null)).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(safeEntries(undefined)).toEqual([])
  })

  it('returns empty array for empty object', () => {
    expect(safeEntries({})).toEqual([])
  })

  it('excludes prototype properties', () => {
    const proto = { inherited: 'should not appear' }
    const obj = Object.create(proto)
    obj.own = 'should appear'
    const entries = safeEntries(obj)
    expect(entries).toEqual([['own', 'should appear']])
    expect(entries.find(([k]) => k === 'inherited')).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { quoteUnsafeIntegers } from '@/utils/jsonBigInt'

const parse = (json: string) => JSON.parse(quoteUnsafeIntegers(json))

describe('quoteUnsafeIntegers', () => {
  it('preserves a 1000-share balance that a double would mangle', () => {
    // The exact payload shape PostgREST returns for ds_members
    const row = parse('[{"member_address":"0x00cc","shares":1000000000000000000000,"loot":0}]')
    expect(row[0].shares).toBe('1000000000000000000000')
    expect(BigInt(row[0].shares)).toBe(1000000000000000000000n)
  })

  it('preserves digits a double would silently drop', () => {
    const row = parse('{"total_shares":1234567890123456789012345}')
    expect(row.total_shares).toBe('1234567890123456789012345')
  })

  it('leaves numbers that fit a double alone', () => {
    const row = parse('{"voting_period":604800,"quorum_percent":5000,"active_member_count":3,"loot":0}')
    expect(row.voting_period).toBe(604800)
    expect(row.quorum_percent).toBe(5000)
    expect(row.active_member_count).toBe(3)
    expect(row.loot).toBe(0)
  })

  it('leaves the largest exactly representable integers as numbers', () => {
    const row = parse('{"a":9007199254740991}')
    expect(row.a).toBe(9007199254740991)
  })

  it('never rewrites digits inside strings', () => {
    const row = parse('{"description":"Raised 1000000000000000000000 wei, ref 12345678901234567890"}')
    expect(row.description).toBe('Raised 1000000000000000000000 wei, ref 12345678901234567890')
  })

  it('handles escaped quotes inside strings', () => {
    const row = parse('{"name":"The \\"1000000000000000000000\\" DAO","shares":1000000000000000000000}')
    expect(row.name).toBe('The "1000000000000000000000" DAO')
    expect(row.shares).toBe('1000000000000000000000')
  })

  it('handles a trailing backslash escape without dropping out of string state', () => {
    const row = parse('{"path":"a\\\\","shares":1000000000000000000000}')
    expect(row.path).toBe('a\\')
    expect(row.shares).toBe('1000000000000000000000')
  })

  it('leaves floats and exponentials untouched', () => {
    const row = parse('{"ratio":1.5,"tiny":1e-7,"big":1e21}')
    expect(row.ratio).toBe(1.5)
    expect(row.tiny).toBe(1e-7)
    expect(row.big).toBe(1e21)
  })

  it('quotes oversized negative integers', () => {
    const row = parse('{"delta":-1000000000000000000000}')
    expect(row.delta).toBe('-1000000000000000000000')
  })

  it('passes through null, booleans, and nested structures', () => {
    const row = parse('{"a":null,"b":true,"c":[{"d":1000000000000000000000}],"e":{"f":7}}')
    expect(row).toEqual({ a: null, b: true, c: [{ d: '1000000000000000000000' }], e: { f: 7 } })
  })

  it('leaves an error payload unchanged', () => {
    const json = '{"code":"PGRST205","message":"Could not find the table","details":null}'
    expect(quoteUnsafeIntegers(json)).toBe(json)
  })
})

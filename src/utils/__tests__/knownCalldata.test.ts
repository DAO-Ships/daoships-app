import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import { decodeKnownCalldata } from '@/utils/knownCalldata'

const NAV = '0x0000000000000000000000000000000000000abc'

function encode(sig: string, fn: string, args: unknown[]): string {
  return new quais.Interface([sig]).encodeFunctionData(fn, args)
}

describe('decodeKnownCalldata', () => {
  it('decodes enableModule (the budget-navigator vault wiring)', () => {
    const data = encode('function enableModule(address module)', 'enableModule', [NAV])
    const decoded = decodeKnownCalldata(data)
    expect(decoded?.name).toBe('enableModule')
    expect(decoded?.args).toHaveLength(1)
    expect(decoded?.args[0].type).toBe('address')
    expect(decoded?.args[0].value.toLowerCase()).toBe(NAV)
  })

  it('decodes disableModule with both addresses', () => {
    const prev = '0x0000000000000000000000000000000000000001'
    const data = encode('function disableModule(address prevModule, address module)', 'disableModule', [prev, NAV])
    const decoded = decodeKnownCalldata(data)
    expect(decoded?.name).toBe('disableModule')
    expect(decoded?.args.map((a) => a.value.toLowerCase())).toEqual([prev, NAV])
  })

  it('decodes an argless admin call (pause)', () => {
    const data = encode('function pause()', 'pause', [])
    const decoded = decodeKnownCalldata(data)
    expect(decoded?.name).toBe('pause')
    expect(decoded?.args).toHaveLength(0)
  })

  it('returns null for empty / unrecognized calldata', () => {
    expect(decodeKnownCalldata('0x')).toBeNull()
    expect(decodeKnownCalldata('')).toBeNull()
    expect(decodeKnownCalldata(undefined)).toBeNull()
    expect(decodeKnownCalldata('0xdeadbeef')).toBeNull() // unknown selector
  })
})

import { describe, it, expect } from 'vitest'
import { safeBigInt, parseBigIntInput } from '@/utils/bigint'

describe('safeBigInt', () => {
  it('parses valid integer strings', () => {
    expect(safeBigInt('123')).toBe(123n)
    expect(safeBigInt('0')).toBe(0n)
    expect(safeBigInt('999999999999999999')).toBe(999999999999999999n)
  })

  it('passes through BigInt values', () => {
    expect(safeBigInt(42n)).toBe(42n)
  })

  it('parses numbers', () => {
    expect(safeBigInt(100)).toBe(100n)
  })

  it('returns fallback for null', () => {
    expect(safeBigInt(null)).toBe(0n)
  })

  it('returns fallback for undefined', () => {
    expect(safeBigInt(undefined)).toBe(0n)
  })

  it('returns fallback for empty string', () => {
    expect(safeBigInt('')).toBe(0n)
    expect(safeBigInt('   ')).toBe(0n)
  })

  it('returns fallback for non-numeric strings', () => {
    expect(safeBigInt('abc')).toBe(0n)
    expect(safeBigInt('12.34')).toBe(0n)
    expect(safeBigInt('not a number')).toBe(0n)
  })

  it('expands exponential notation rather than reporting zero', () => {
    // A 1000-share balance (1e21) that reached JS as a double stringifies this way
    expect(safeBigInt('1e+21')).toBe(1000000000000000000000n)
    expect(safeBigInt(1e21)).toBe(1000000000000000000000n)
    expect(safeBigInt('1.5e3')).toBe(1500n)
    expect(safeBigInt('3e21')).toBe(3000000000000000000000n)
  })

  it('returns fallback for exponential values that are not whole numbers', () => {
    expect(safeBigInt('1.234e2')).toBe(0n)
    expect(safeBigInt('1e-21')).toBe(0n)
  })

  it('uses custom fallback values', () => {
    expect(safeBigInt(null, 99n)).toBe(99n)
    expect(safeBigInt('invalid', 42n)).toBe(42n)
    expect(safeBigInt(undefined, 1000n)).toBe(1000n)
  })
})

describe('parseBigIntInput', () => {
  it('parses valid non-negative integer strings', () => {
    expect(parseBigIntInput('0')).toBe(0n)
    expect(parseBigIntInput('123')).toBe(123n)
    expect(parseBigIntInput('1000000000000000000')).toBe(1000000000000000000n)
  })

  it('trims whitespace before parsing', () => {
    expect(parseBigIntInput('  42  ')).toBe(42n)
  })

  it('rejects empty string', () => {
    expect(() => parseBigIntInput('')).toThrow('Input cannot be empty')
    expect(() => parseBigIntInput('   ')).toThrow('Input cannot be empty')
  })

  it('rejects non-numeric strings', () => {
    expect(() => parseBigIntInput('abc')).toThrow('Input must be a non-negative integer')
    expect(() => parseBigIntInput('12abc')).toThrow('Input must be a non-negative integer')
  })

  it('rejects decimal numbers', () => {
    expect(() => parseBigIntInput('12.34')).toThrow('Input must be a non-negative integer')
    expect(() => parseBigIntInput('0.5')).toThrow('Input must be a non-negative integer')
  })

  it('rejects negative numbers', () => {
    expect(() => parseBigIntInput('-1')).toThrow('Input must be a non-negative integer')
    expect(() => parseBigIntInput('-100')).toThrow('Input must be a non-negative integer')
  })
})

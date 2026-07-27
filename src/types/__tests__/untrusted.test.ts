// C4: Untrusted<T> is a compile-time marking discipline. Most of its value is in
// errors that never reach runtime, so these tests pin the two things that can
// still go wrong: the brand must erase completely (no runtime cost, no changed
// identity), and the helpers must preserve null/undefined rather than coercing.
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  markUntrusted,
  markUntrustedMaybe,
  unwrapUntrusted,
  unwrapUntrustedMaybe,
  isBlankUntrusted,
  type Untrusted,
} from '../untrusted'

describe('Untrusted — runtime behaviour', () => {
  it('erases entirely: the marked value is the same value', () => {
    const raw = { title: 'hi' }
    expect(markUntrusted(raw)).toBe(raw)
    expect(markUntrusted('text')).toBe('text')
  })

  it('round-trips through mark and unwrap unchanged', () => {
    const hostile = '<img src=x onerror=alert(1)>'
    expect(unwrapUntrusted(markUntrusted(hostile), 'test')).toBe(hostile)
  })

  it('adds no enumerable property that could leak into JSON or a render', () => {
    const marked = markUntrusted({ a: 1 })
    expect(Object.keys(marked)).toEqual(['a'])
    expect(JSON.stringify(marked)).toBe('{"a":1}')
  })

  it('preserves null and undefined in the maybe variants', () => {
    expect(markUntrustedMaybe(null)).toBeNull()
    expect(markUntrustedMaybe(undefined)).toBeUndefined()
    expect(unwrapUntrustedMaybe(null, 'r')).toBeNull()
    expect(unwrapUntrustedMaybe(undefined, 'r')).toBeUndefined()
  })

  it('does not treat empty string as absent when marking', () => {
    // '' is a legitimate attacker-supplied value, distinct from "no value".
    expect(markUntrustedMaybe('')).toBe('')
  })

  it('isBlankUntrusted covers absent, empty and whitespace-only', () => {
    expect(isBlankUntrusted(null)).toBe(true)
    expect(isBlankUntrusted(undefined)).toBe(true)
    expect(isBlankUntrusted(markUntrusted(''))).toBe(true)
    expect(isBlankUntrusted(markUntrusted('   \n\t '))).toBe(true)
    expect(isBlankUntrusted(markUntrusted('x'))).toBe(false)
  })
})

describe('Untrusted — the type contract', () => {
  it('is assignable from its base type but not to it', () => {
    expectTypeOf<string>().toExtend<string>()
    // A marked string is still a string...
    expectTypeOf<Untrusted<string>>().toExtend<string>()
    // ...but a plain string is not a marked one, so a boundary cannot be skipped.
    expectTypeOf<string>().not.toExtend<Untrusted<string>>()
  })

  it('unwrap returns the bare base type', () => {
    const marked = markUntrusted('x')
    expectTypeOf(unwrapUntrusted(marked, 'r')).toEqualTypeOf<string>()
  })

  it('keeps string methods usable without unwrapping', () => {
    // Length and emptiness checks should not need an unwrap, or the audit list
    // that grepping unwrapUntrusted produces fills with noise.
    const marked = markUntrusted('hello')
    expect(marked.length).toBe(5)
    expect(marked.trim()).toBe('hello')
  })
})

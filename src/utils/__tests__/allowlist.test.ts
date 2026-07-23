import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import {
  parseAllowlistInput,
  buildAllowlistTree,
  getAllowlistProof,
  isAllowlisted,
  verifyAllowlistRoot,
  isOpenAllowlist,
  ZERO_BYTES32,
  type AllowlistTreeDump,
} from '../allowlist'

// Real, deterministic Cyprus-1 (0x00-prefixed) addresses — checksummed via quais so they
// pass isValidCyprus1Address. The whole point of this module is real Merkle crypto, so
// nothing here is mocked.
const A = quais.getAddress('0x00000000000000000000000000000000000000aa')
const B = quais.getAddress('0x0012340000000000000000000000000000005678')
const C = quais.getAddress('0x00abcdef000000000000000000000000000000cc')
const OFF_SHARD = quais.getAddress('0x0100000000000000000000000000000000000011') // not 0x00

describe('parseAllowlistInput', () => {
  it('accepts both newline- and comma-separated addresses, checksummed', () => {
    const { addresses, invalid } = parseAllowlistInput(`${A.toLowerCase()}\n${B}, ${C}`)
    expect(addresses).toEqual([A, B, C])
    expect(invalid).toEqual([])
  })

  it('deduplicates case-insensitively, keeping the checksummed form', () => {
    const { addresses } = parseAllowlistInput(`${A}\n${A.toLowerCase()}\n${A.toUpperCase().replace('0X', '0x')}`)
    expect(addresses).toEqual([A])
  })

  it('rejects an off-shard (non-Cyprus-1) address — it could never claim from an immutable root', () => {
    const { addresses, invalid } = parseAllowlistInput(`${A}\n${OFF_SHARD}`)
    expect(addresses).toEqual([A])
    expect(invalid).toEqual([OFF_SHARD])
  })

  it('routes malformed lines to invalid without throwing', () => {
    const { addresses, invalid } = parseAllowlistInput(`${A}\nnot-an-address\n0x1234`)
    expect(addresses).toEqual([A])
    expect(invalid).toEqual(['not-an-address', '0x1234'])
  })

  it('ignores blank and whitespace-only lines', () => {
    const { addresses, invalid } = parseAllowlistInput(`\n   \n${A}\n\n`)
    expect(addresses).toEqual([A])
    expect(invalid).toEqual([])
  })
})

describe('buildAllowlistTree', () => {
  it('returns null for an empty list (no allowlist to build)', () => {
    expect(buildAllowlistTree([])).toBeNull()
  })

  it('produces a tree whose root verifies against its own dump', () => {
    const tree = buildAllowlistTree([A, B, C])!
    expect(tree).not.toBeNull()
    expect(verifyAllowlistRoot(tree.dump(), tree.root)).toBe(true)
  })
})

describe('getAllowlistProof / isAllowlisted', () => {
  const dump: AllowlistTreeDump = buildAllowlistTree([A, B, C])!.dump()

  it('generates a proof for a listed address, matched case-insensitively', () => {
    const proof = getAllowlistProof(dump, A.toLowerCase())
    expect(Array.isArray(proof)).toBe(true)
    expect(isAllowlisted(dump, A)).toBe(true)
  })

  it('returns null / false for an address not in the tree', () => {
    const outsider = quais.getAddress('0x00ffffffffffffffffffffffffffffffffffffff')
    expect(getAllowlistProof(dump, outsider)).toBeNull()
    expect(isAllowlisted(dump, outsider)).toBe(false)
  })

  it('returns null on a malformed dump instead of throwing', () => {
    const bad = { not: 'a tree' } as unknown as AllowlistTreeDump
    expect(getAllowlistProof(bad, A)).toBeNull()
    expect(isAllowlisted(bad, A)).toBe(false)
  })
})

describe('verifyAllowlistRoot — the only defense against a tampered IPFS gateway', () => {
  const tree = buildAllowlistTree([A, B, C])!
  const dump = tree.dump()

  it('accepts the matching root regardless of casing', () => {
    expect(verifyAllowlistRoot(dump, tree.root.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  it('rejects a root that does not match the reconstructed tree', () => {
    expect(verifyAllowlistRoot(dump, ZERO_BYTES32)).toBe(false)
  })

  it('rejects a malformed dump', () => {
    expect(verifyAllowlistRoot({ bogus: true } as unknown as AllowlistTreeDump, tree.root)).toBe(false)
  })
})

describe('isOpenAllowlist', () => {
  it('treats missing / empty roots as open', () => {
    expect(isOpenAllowlist(undefined)).toBe(true)
    expect(isOpenAllowlist(null)).toBe(true)
    expect(isOpenAllowlist('')).toBe(true)
  })

  it('treats zero roots (bytes32, 0x0, all-zeros) as open', () => {
    expect(isOpenAllowlist(ZERO_BYTES32)).toBe(true)
    expect(isOpenAllowlist('0x0')).toBe(true)
    expect(isOpenAllowlist('0x00000000')).toBe(true)
  })

  it('treats a real non-zero root as a closed allowlist', () => {
    const tree = buildAllowlistTree([A, B])!
    expect(isOpenAllowlist(tree.root)).toBe(false)
  })
})

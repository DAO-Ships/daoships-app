// ═══════════════════════════════════════════════════════════════════════════
// H25: navigator IPFS CIDs are derived from CBOR metadata, not hand-copied.
//
// The eight CIDs below are the literals that shipped before derivation replaced
// them, pinned here deliberately. Derivation must reproduce them exactly — if a
// change to extractIpfsCid alters what we hand to quais.ContractFactory, that is
// a change to what gets deployed and verified on-chain, and it should fail here
// rather than in production.
//
// When an artifact is legitimately recompiled, its bytecode and its expected CID
// change together in one commit. That is the point: there is no longer a way to
// update one without the other.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { extractIpfsCid, requireIpfsCid } from '../bytecodeMetadata'
import { ONBOARDER_NAVIGATOR_BYTECODE } from '@/config/abi/OnboarderNavigator.bytecode'
import { ERC20_TRIBUTE_NAVIGATOR_BYTECODE } from '@/config/abi/ERC20TributeNavigator.bytecode'
import { NFT_GATED_NAVIGATOR_BYTECODE } from '@/config/abi/NFTGatedNavigator.bytecode'
import { SIGNAL_NAVIGATOR_BYTECODE } from '@/config/abi/SignalNavigator.bytecode'
import { VESTING_NAVIGATOR_BYTECODE } from '@/config/abi/VestingNavigator.bytecode'
import { TIMELOCK_NAVIGATOR_BYTECODE } from '@/config/abi/TimelockNavigator.bytecode'
import { SUBSCRIPTION_NAVIGATOR_BYTECODE } from '@/config/abi/SubscriptionNavigator.bytecode'
import { BUDGET_NAVIGATOR_BYTECODE } from '@/config/abi/BudgetNavigator.bytecode'

const SHIPPED: ReadonlyArray<[string, string, string]> = [
  ['OnboarderNavigator', ONBOARDER_NAVIGATOR_BYTECODE, 'QmeFR5wgHwGL91BAUQoQrdfhmFGCagQKoUzBEsYRMCkgdn'],
  ['ERC20TributeNavigator', ERC20_TRIBUTE_NAVIGATOR_BYTECODE, 'QmNkqVRbHfJVnEfa36XDRYV8xrPpJmsBJDm2XuyY2ufFJN'],
  ['NFTGatedNavigator', NFT_GATED_NAVIGATOR_BYTECODE, 'Qmavg3RjwCjRCEHUHRayeg4gj2UoiB9t1uKEUbsL5qb5md'],
  ['SignalNavigator', SIGNAL_NAVIGATOR_BYTECODE, 'QmQTefaaDcNXkZjjXGdt9czkZEjxZGjqvHuY95h1bHvJLF'],
  ['VestingNavigator', VESTING_NAVIGATOR_BYTECODE, 'QmdSX6vuYL2vcmsAEXAm9rT1nwjBivxwU8iwHeURHSPvgi'],
  ['TimelockNavigator', TIMELOCK_NAVIGATOR_BYTECODE, 'QmRHkRsWTPGDoeP6XKL9RuXMkBfWdboQDPuYBm4NRvh8qn'],
  ['SubscriptionNavigator', SUBSCRIPTION_NAVIGATOR_BYTECODE, 'QmPYtpmxAbU6WrYNz1h8V7ikQSDoaE7QDKRjMsbdzULZMa'],
  ['BudgetNavigator', BUDGET_NAVIGATOR_BYTECODE, 'QmaWqpzw5A8bGYxGUhmCir34iLc1aeZWeiTZrYBgCrUNue'],
]

describe('extractIpfsCid — derived CIDs match the literals they replaced', () => {
  it.each(SHIPPED)('%s', (_name, bytecode, expected) => {
    expect(extractIpfsCid(bytecode)).toBe(expected)
  })

  it('produces a well-formed CIDv0 for every shipped navigator', () => {
    for (const [, bytecode] of SHIPPED) {
      const cid = extractIpfsCid(bytecode)
      // quais.ContractFactory requires exactly this shape.
      expect(cid).toMatch(/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/)
      expect(cid).toHaveLength(46)
    }
  })

  it('derives all eight distinctly — no copy-paste collisions', () => {
    const cids = SHIPPED.map(([, b]) => extractIpfsCid(b))
    expect(new Set(cids).size).toBe(SHIPPED.length)
  })
})

describe('extractIpfsCid — inputs that must not yield a wrong answer', () => {
  it('accepts bytecode without the 0x prefix', () => {
    const [, bytecode, expected] = SHIPPED[0]
    expect(extractIpfsCid(bytecode.slice(2))).toBe(expected)
  })

  it('returns null for a non-hex string', () => {
    expect(extractIpfsCid('0xnot-hex-at-all')).toBeNull()
  })

  it('returns null for bytecode too short to carry an auxdata length', () => {
    expect(extractIpfsCid('0x00')).toBeNull()
    expect(extractIpfsCid('0x')).toBeNull()
  })

  it('returns null when the declared auxdata length overruns the bytecode', () => {
    // Trailing 0xffff claims 65535 bytes of auxdata that are not there.
    expect(extractIpfsCid('0xdeadbeefffff')).toBeNull()
  })

  it('returns null when the appendix carries no ipfs entry', () => {
    // Valid 4-byte auxdata ("solc"-only style), no 0x64697066735822 marker.
    expect(extractIpfsCid('0x' + 'aa'.repeat(20) + '64736f6c' + '0004')).toBeNull()
  })

  it('returns null rather than a truncated CID when the digest is cut short', () => {
    // Marker present but fewer than 34 bytes follow it.
    const aux = '64697066735822' + '12'.repeat(10)
    const len = (aux.length / 2).toString(16).padStart(4, '0')
    expect(extractIpfsCid('0x' + aux + len)).toBeNull()
  })
})

describe('requireIpfsCid', () => {
  it('returns the CID when derivation succeeds', () => {
    expect(requireIpfsCid(ONBOARDER_NAVIGATOR_BYTECODE, 'OnboarderNavigator')).toBe(SHIPPED[0][2])
  })

  it('throws naming the contract when derivation fails', () => {
    expect(() => requireIpfsCid('0x00', 'SomeNavigator'))
      .toThrow(/Could not derive an IPFS CID from SomeNavigator/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C1: the salt-mining math had no tests — saltMinerCancel covers worker
// cancellation and re-entrancy, not the prediction itself.
//
// This is the computation whose failure is silent and expensive: predict the
// wrong address and the launch either deploys somewhere unexpected or reverts on
// the shard-prefix check, after the user has already paid for the navigator
// deploys that run first in the pipeline.
//
// The live differential check (does our prediction match the launcher's own
// calculateAllAddresses?) is in create2.onchain.test.ts — opt-in, since it needs
// the network.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { quais } from 'quais'
import {
  minimalProxyBytecode,
  minimalProxyInitCodeHash,
  packSalt,
  predictCreate2Address,
  isCyprus1Address,
} from '../create2'

const SINGLETON = '0x000F38Dc0B711a57086ca0bD6fa2041D8Cd9Fe03'
const FACTORY = '0x005D0D996cB3f25bEC37E1827FeAfCe5AC9f7856'
const LAUNCHER = '0x0054Cb24fA412B2b276D5F73f4A7adC70f0f0Cbf'
const EOA = '0x001117dd3c8574bc34227074472fb64349d2c3e9'
const SALT = '0x' + '11'.repeat(32)

describe('minimalProxyBytecode — ERC-1167 layout', () => {
  it('splices the implementation into the standard creation code', () => {
    const bc = minimalProxyBytecode(SINGLETON)
    expect(bc).toBe(
      '0x3d602d80600a3d3981f3363d3d373d3d3d363d73'
      + '000f38dc0b711a57086ca0bd6fa2041d8cd9fe03'
      + '5af43d82803e903d91602b57fd5bf3',
    )
  })

  it('is 55 bytes — the ERC-1167 creation code length', () => {
    expect(quais.getBytes(minimalProxyBytecode(SINGLETON))).toHaveLength(55)
  })

  it('lowercases the address, because this is bytecode and not an ABI argument', () => {
    // A checksummed splice would change the bytes and therefore the address.
    expect(minimalProxyBytecode(SINGLETON)).toBe(minimalProxyBytecode(SINGLETON.toLowerCase()))
    expect(minimalProxyBytecode(SINGLETON)).not.toContain('F38Dc')
  })

  it('accepts an address with or without the 0x prefix', () => {
    expect(minimalProxyBytecode(SINGLETON.slice(2))).toBe(minimalProxyBytecode(SINGLETON))
  })

  it('refuses anything that is not a 20-byte address', () => {
    expect(() => minimalProxyBytecode('0xdeadbeef')).toThrow(/20-byte address/)
    expect(() => minimalProxyBytecode('0x' + 'ab'.repeat(21))).toThrow(/20-byte address/)
  })

  it('produces a different initCodeHash per singleton', () => {
    const other = '0x001a4f36ead605149A0144C771B7cbf4116753a9'
    expect(minimalProxyInitCodeHash(SINGLETON)).not.toBe(minimalProxyInitCodeHash(other))
  })
})

describe('packSalt — the two packing modes are equivalent, despite the naming', () => {
  // Worth stating plainly, because the codebase and the developer docs both
  // implied these differ: `abi.encodePacked` of a bytes32 and of a uint256 are
  // the SAME 32 big-endian bytes for the same value. The Solidity signatures
  // differ (QuaiVaultFactory takes bytes32, DAOShipLauncher takes uint256) but
  // the hashed preimage does not, so one implementation serves both and a
  // mismatched saltPackingType cannot produce a wrong address.
  it('yields identical salts for bytes32 and uint256 packing', () => {
    for (const salt of [SALT, '0x' + '00'.repeat(31) + '01', '0x' + 'ff'.repeat(32)]) {
      expect(packSalt(LAUNCHER, salt, 'bytes32'), salt)
        .toBe(packSalt(LAUNCHER, salt, 'uint256'))
    }
  })

  it('matches abi.encodePacked(address, bytes32) for the vault factory', () => {
    expect(packSalt(LAUNCHER, SALT, 'bytes32')).toBe(
      quais.keccak256(quais.solidityPacked(['address', 'bytes32'], [LAUNCHER, SALT])),
    )
  })

  it('matches abi.encodePacked(address, uint256) for the DAOShip launcher', () => {
    expect(packSalt(LAUNCHER, SALT, 'uint256')).toBe(
      quais.keccak256(quais.solidityPacked(['address', 'uint256'], [LAUNCHER, BigInt(SALT)])),
    )
  })

  it('is sensitive to the sender — the launcher is not the EOA', () => {
    // The single most consequential mistake in this file: at deploy time
    // msg.sender to both factories is DAOShipAndVaultLauncher, never the wallet.
    expect(packSalt(LAUNCHER, SALT, 'uint256')).not.toBe(packSalt(EOA, SALT, 'uint256'))
  })

  it('is deterministic', () => {
    expect(packSalt(LAUNCHER, SALT, 'uint256')).toBe(packSalt(LAUNCHER, SALT, 'uint256'))
  })

  it('requires a full 32-byte salt — a short hex string is not equivalent', () => {
    // BigInt('0x01') and a padded bytes32 hash the same, but a SHORT hex string
    // passed as bytes32 would pack to fewer bytes. Callers must pad.
    const padded = '0x' + '00'.repeat(31) + '01'
    expect(packSalt(LAUNCHER, padded, 'uint256')).toBe(packSalt(LAUNCHER, padded, 'bytes32'))
    expect(() => packSalt(LAUNCHER, '0x01', 'bytes32')).toThrow()
  })
})

describe('predictCreate2Address', () => {
  it('equals quais.getCreate2Address over the packed salt', () => {
    const initCodeHash = minimalProxyInitCodeHash(SINGLETON)
    const full = packSalt(LAUNCHER, SALT, 'uint256')
    expect(predictCreate2Address(FACTORY, LAUNCHER, SALT, initCodeHash, 'uint256'))
      .toBe(quais.getCreate2Address(FACTORY, full, initCodeHash))
  })

  it('changes when any single input changes', () => {
    const h = minimalProxyInitCodeHash(SINGLETON)
    const base = predictCreate2Address(FACTORY, LAUNCHER, SALT, h, 'uint256')

    expect(predictCreate2Address(EOA, LAUNCHER, SALT, h, 'uint256')).not.toBe(base)
    expect(predictCreate2Address(FACTORY, EOA, SALT, h, 'uint256')).not.toBe(base)
    expect(predictCreate2Address(FACTORY, LAUNCHER, '0x' + '22'.repeat(32), h, 'uint256')).not.toBe(base)
    // NOT packing mode — see the packSalt block: the two are equivalent.
    expect(predictCreate2Address(FACTORY, LAUNCHER, SALT, h, 'bytes32')).toBe(base)
    expect(
      predictCreate2Address(FACTORY, LAUNCHER, SALT, minimalProxyInitCodeHash(EOA), 'uint256'),
    ).not.toBe(base)
  })

  it('returns a checksummed address', () => {
    const addr = predictCreate2Address(FACTORY, LAUNCHER, SALT, minimalProxyInitCodeHash(SINGLETON), 'uint256')
    expect(quais.getAddress(addr)).toBe(addr)
  })
})

describe('isCyprus1Address — what mining searches for', () => {
  it('requires both the 0x00 prefix and isQuaiAddress', () => {
    expect(isCyprus1Address(SINGLETON)).toBe(true)
    expect(isCyprus1Address(EOA)).toBe(true)
  })

  it('rejects an address outside the zone', () => {
    expect(isCyprus1Address('0x1111111111111111111111111111111111111111')).toBe(false)
    expect(isCyprus1Address('0xff11111111111111111111111111111111111111')).toBe(false)
  })

  it('is case-insensitive about the prefix', () => {
    expect(isCyprus1Address(SINGLETON.toLowerCase())).toBe(true)
  })

  it('finds a Cyprus-1 hit within a realistic number of attempts', () => {
    // ~1/256 per attempt, so 100k is the worker's cap for a reason. Assert the
    // search actually converges rather than trusting the constant.
    const h = minimalProxyInitCodeHash(SINGLETON)
    let found: string | null = null
    for (let i = 0; i < 5000; i++) {
      const salt = quais.zeroPadValue(quais.toBeHex(i), 32)
      const addr = predictCreate2Address(FACTORY, LAUNCHER, salt, h, 'uint256')
      if (isCyprus1Address(addr)) { found = addr; break }
    }
    expect(found, 'no Cyprus-1 address in 5000 attempts (expected ~1 in 256)').not.toBeNull()
  })
})

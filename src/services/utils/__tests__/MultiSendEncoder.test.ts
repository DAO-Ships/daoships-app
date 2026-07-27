// ═══════════════════════════════════════════════════════════════════════════
// C1: MultiSendEncoder had no tests at all.
//
// This is binary packing, not ABI encoding, and it is the payload every
// governance action executes through. A single byte out of place shifts every
// subsequent field — the batch still executes, just not as the proposal said.
// By the time that is visible the proposal has already passed and processed.
//
// Layout per transaction, tightly packed:
//   1  byte  operation (0 = call, 1 = delegatecall)
//   20 bytes to
//   32 bytes value      (big-endian uint256)
//   32 bytes dataLength (big-endian uint256)
//   N  bytes data
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { encodeMultiSendTx, encodeMultiSend } from '../MultiSendEncoder'

const ADDR = '0x00112233445566778899aAbBcCdDeEff00112233'
const ADDR_BODY = '00112233445566778899aabbccddeeff00112233'

/** Slice the packed blob the way the MultiSend contract's assembly does. */
function fields(hex: string, offset = 0) {
  const h = hex.slice(2) // drop 0x
  const at = (start: number, len: number) => h.slice((offset + start) * 2, (offset + start + len) * 2)
  const dataLen = parseInt(at(53, 32), 16)
  return {
    operation: parseInt(at(0, 1), 16),
    to: at(1, 20),
    value: BigInt('0x' + at(21, 32)),
    dataLength: dataLen,
    data: at(85, dataLen),
    totalBytes: 85 + dataLen,
  }
}

describe('encodeMultiSendTx — field layout', () => {
  it('packs each field at its exact offset', () => {
    const hex = '0x' + Buffer.from(encodeMultiSendTx(0, ADDR, 1234n, '0xabcdef')).toString('hex')
    const f = fields(hex)
    expect(f.operation).toBe(0)
    expect(f.to).toBe(ADDR_BODY)
    expect(f.value).toBe(1234n)
    expect(f.dataLength).toBe(3)
    expect(f.data).toBe('abcdef')
  })

  it('is exactly 85 bytes when there is no calldata', () => {
    expect(encodeMultiSendTx(0, ADDR, 0n, '0x')).toHaveLength(85)
  })

  it('grows by exactly the calldata length', () => {
    expect(encodeMultiSendTx(0, ADDR, 0n, '0x' + 'ff'.repeat(100))).toHaveLength(185)
  })

  it('encodes delegatecall as operation 1', () => {
    const hex = '0x' + Buffer.from(encodeMultiSendTx(1, ADDR, 0n, '0x')).toString('hex')
    expect(fields(hex).operation).toBe(1)
  })

  it('round-trips a full uint256 value without truncation', () => {
    const max = 2n ** 256n - 1n
    const hex = '0x' + Buffer.from(encodeMultiSendTx(0, ADDR, max, '0x')).toString('hex')
    expect(fields(hex).value).toBe(max)
  })

  it('accepts an address without the 0x prefix', () => {
    const withPrefix = encodeMultiSendTx(0, ADDR, 0n, '0x')
    const without = encodeMultiSendTx(0, ADDR_BODY, 0n, '0x')
    expect(without).toEqual(withPrefix)
  })

  it('accepts calldata without the 0x prefix', () => {
    expect(encodeMultiSendTx(0, ADDR, 0n, 'abcdef')).toEqual(
      encodeMultiSendTx(0, ADDR, 0n, '0xabcdef'),
    )
  })
})

describe('encodeMultiSendTx — inputs that would corrupt the blob', () => {
  it('refuses a negative value', () => {
    // A negative bigint stringifies to '-...' in hex, which would shift every
    // field after it and silently re-target the rest of the batch.
    expect(() => encodeMultiSendTx(0, ADDR, -1n, '0x'))
      .toThrow(/value must be non-negative/)
  })

  it('refuses an address that is not 20 bytes', () => {
    expect(() => encodeMultiSendTx(0, '0x' + 'ab'.repeat(21), 0n, '0x'))
      .toThrow(/must be a 20-byte address/)
  })

  it('rejects odd-length calldata rather than packing a wrong length', () => {
    expect(() => encodeMultiSendTx(0, ADDR, 0n, '0xabc')).toThrow()
  })

  it('rejects non-hex calldata', () => {
    expect(() => encodeMultiSendTx(0, ADDR, 0n, '0xzzzz')).toThrow()
  })

  it('masks an out-of-range operation to one byte rather than overflowing', () => {
    const hex = '0x' + Buffer.from(encodeMultiSendTx(257, ADDR, 0n, '0x')).toString('hex')
    const f = fields(hex)
    expect(f.operation).toBe(1) // 257 & 0xff
    expect(f.to).toBe(ADDR_BODY) // and the following fields are undisturbed
  })
})

describe('encodeMultiSend — concatenation', () => {
  const B = '0x00ffeeddccbbaa998877665544332211ffeeddcc'
  const B_BODY = '00ffeeddccbbaa998877665544332211ffeeddcc'

  it('returns 0x for an empty batch', () => {
    expect(encodeMultiSend([])).toBe('0x')
  })

  it('preserves order and boundaries across two transactions', () => {
    const hex = encodeMultiSend([
      { operation: 0, to: ADDR, value: 1n, data: '0xaabb' },
      { operation: 1, to: B, value: 2n, data: '0x' },
    ])

    const first = fields(hex)
    expect(first.operation).toBe(0)
    expect(first.to).toBe(ADDR_BODY)
    expect(first.value).toBe(1n)
    expect(first.data).toBe('aabb')

    const second = fields(hex, first.totalBytes)
    expect(second.operation).toBe(1)
    expect(second.to).toBe(B_BODY)
    expect(second.value).toBe(2n)
    expect(second.dataLength).toBe(0)
  })

  it('equals the concatenation of the individually-encoded parts', () => {
    const txs = [
      { operation: 0, to: ADDR, value: 5n, data: '0x1234' },
      { operation: 0, to: B, value: 0n, data: '0x' },
      { operation: 1, to: ADDR, value: 7n, data: '0xdeadbeef' },
    ]
    const joined = txs
      .map((t) => Buffer.from(encodeMultiSendTx(t.operation, t.to, t.value, t.data)).toString('hex'))
      .join('')
    expect(encodeMultiSend(txs)).toBe('0x' + joined)
  })

  it('produces a byte length equal to the sum of its parts', () => {
    const txs = [
      { operation: 0, to: ADDR, value: 0n, data: '0x' + 'aa'.repeat(10) },
      { operation: 0, to: B, value: 0n, data: '0x' + 'bb'.repeat(64) },
    ]
    // (85 + 10) + (85 + 64) = 244 bytes -> 488 hex chars + '0x'
    expect(encodeMultiSend(txs)).toHaveLength(2 + 244 * 2)
  })

  it('fails the whole batch if any transaction is invalid', () => {
    // Partial encoding would produce a blob that executes some actions and
    // garbles the rest — refusing the batch is the only safe outcome.
    expect(() => encodeMultiSend([
      { operation: 0, to: ADDR, value: 0n, data: '0x' },
      { operation: 0, to: ADDR, value: -1n, data: '0x' },
    ])).toThrow(/value must be non-negative/)
  })
})

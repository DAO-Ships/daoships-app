// ═══════════════════════════════════════════════════════════════════════════
// MultiSend Binary Encoder
//
// Encodes transactions for the Gnosis Safe MultiSend contract.
// This is binary-packed encoding, NOT ABI encoding.
//
// Per-transaction layout (tightly packed):
//   1 byte   - operation (0 = call, 1 = delegatecall)
//   20 bytes - to (address)
//   32 bytes - value (uint256, big-endian)
//   32 bytes - dataLength (uint256, big-endian)
//   N bytes  - data
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

/**
 * A single transaction to be packed into a MultiSend call.
 */
export interface MultiSendTx {
  /** 0 = call, 1 = delegatecall */
  operation: number
  /** Target contract address */
  to: string
  /** Native token value to send (wei) */
  value: bigint
  /** Calldata hex string (0x-prefixed) */
  data: string
}

/**
 * Encode a single transaction into the MultiSend binary format.
 *
 * @param operation - 0 for call, 1 for delegatecall
 * @param to        - Target address
 * @param value     - Native token value in wei
 * @param data      - Calldata as 0x-prefixed hex string
 * @returns Packed Uint8Array for this transaction
 */
export function encodeMultiSendTx(
  operation: number,
  to: string,
  value: bigint,
  data: string,
): Uint8Array {
  // Defense-in-depth: a negative value would serialize to a '-'-prefixed hex string and
  // corrupt the packed blob (shifting every subsequent field). Callers gate input upstream,
  // but the encoder must not trust them.
  if (value < 0n) {
    throw new Error('encodeMultiSendTx: value must be non-negative')
  }

  // Strip 0x prefix and convert data to bytes
  const dataHex = data.startsWith('0x') ? data.slice(2) : data
  const dataBytes = quais.getBytes(`0x${dataHex}`)
  const dataLength = dataBytes.length

  // Total: 1 + 20 + 32 + 32 + dataLength
  const packed = new Uint8Array(85 + dataLength)

  // 1 byte: operation
  packed[0] = operation & 0xff

  // 20 bytes: to address (strip 0x, left-padded is not needed - addresses are 20 bytes)
  const toHex = to.startsWith('0x') ? to.slice(2) : to
  const toBytes = quais.getBytes(`0x${toHex.padStart(40, '0')}`)
  if (toBytes.length !== 20) {
    throw new Error('encodeMultiSendTx: `to` must be a 20-byte address')
  }
  packed.set(toBytes, 1)

  // 32 bytes: value (big-endian uint256)
  const valueHex = value.toString(16).padStart(64, '0')
  const valueBytes = quais.getBytes(`0x${valueHex}`)
  packed.set(valueBytes, 21)

  // 32 bytes: data length (big-endian uint256)
  const lenHex = dataLength.toString(16).padStart(64, '0')
  const lenBytes = quais.getBytes(`0x${lenHex}`)
  packed.set(lenBytes, 53)

  // N bytes: data
  packed.set(dataBytes, 85)

  return packed
}

/**
 * Encode multiple transactions into a single MultiSend-compatible hex string.
 *
 * The result is passed to MultiSend.multiSend(bytes transactions).
 *
 * @param transactions - Array of transactions to pack
 * @returns 0x-prefixed hex string of all packed transactions concatenated
 */
export function encodeMultiSend(transactions: MultiSendTx[]): string {
  // Encode each transaction individually
  const encodedParts = transactions.map((tx) =>
    encodeMultiSendTx(tx.operation, tx.to, tx.value, tx.data),
  )

  // Calculate total length
  const totalLength = encodedParts.reduce((sum, part) => sum + part.length, 0)

  // Concatenate all parts
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of encodedParts) {
    result.set(part, offset)
    offset += part.length
  }

  return quais.hexlify(result)
}

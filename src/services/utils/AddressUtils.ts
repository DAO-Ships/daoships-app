// ═══════════════════════════════════════════════════════════════════════════
// Address Utilities
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

/**
 * The zero address constant (0x0000...0000).
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Return the checksummed (mixed-case) form of an address.
 *
 * @param address - A 0x-prefixed hex address
 * @returns Checksummed address string
 * @throws If the address is not a valid hex address
 */
export function checksumAddress(address: string): string {
  return quais.getAddress(address)
}

/**
 * The app's canonical check for a user-enterable address: a well-formed,
 * checksum-valid address that lives on this network (Cyprus-1 shard, non-zero).
 *
 * This is the strict validator used by every form. For a lenient "is this a
 * well-formed address value" check that accepts the zero/native sentinel or a
 * foreign-shard address (e.g. display, or counting the native token), call
 * `quais.isAddress` directly instead.
 */
export function isAddress(value: unknown): value is string {
  return typeof value === 'string' && isValidCyprus1Address(value)
}

/**
 * Return the lowercase form of an address for case-insensitive comparisons.
 *
 * @param address - A 0x-prefixed hex address
 * @returns Lowercase address string
 */
export function lowercaseAddress(address: string): string {
  return address.toLowerCase()
}

/**
 * Truncate an address for display: "0x1234...abcd".
 *
 * @param address   - A 0x-prefixed hex address
 * @param prefixLen - Characters to keep after "0x" (default 6, so total prefix is 8 with "0x")
 * @param suffixLen - Characters to keep at the end (default 4)
 * @returns Truncated address string
 */
export function formatAddress(address: string, prefixLen: number = 6, suffixLen: number = 4): string {
  if (!address || typeof address !== 'string') return ''
  if (address.length <= prefixLen + suffixLen + 2) {
    return address
  }
  return `${address.slice(0, prefixLen + 2)}...${address.slice(-suffixLen)}`
}

/**
 * Check if an address is the zero address.
 *
 * @param address - A 0x-prefixed hex address
 * @returns true if the address is the zero address
 */
export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS
}

/**
 * Validate a Quai Cyprus-1 address: well-formed + EIP-55 checksum (via quais),
 * on the Cyprus-1 shard (0x00… prefix), and not the zero address.
 */
export function isValidCyprus1Address(address: string): boolean {
  if (!quais.isAddress(address)) return false // format + checksum
  const lower = address.toLowerCase()
  if (lower === ZERO_ADDRESS) return false
  return lower.startsWith('0x00') // Cyprus-1 shard byte
}

/**
 * Normalize and validate an address for comparison or query use.
 * Returns the lowercased address, or null if invalid.
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null
  const trimmed = address.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/**
 * Compare two addresses for equality after normalization.
 * Returns false if either address is invalid.
 */
export function addressesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normA = normalizeAddress(a)
  const normB = normalizeAddress(b)
  if (!normA || !normB) return false
  return normA === normB
}

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
 * Validate a Quai Cyprus-1 address.
 * Must be 42-char hex string starting with 0x00 and not the zero address.
 */
export function isValidCyprus1Address(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false
  if (address.toLowerCase() === ZERO_ADDRESS) return false
  if (!address.toLowerCase().startsWith('0x00')) return false
  return true
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

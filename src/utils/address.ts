// ═══════════════════════════════════════════════════════════════════════════
// Address Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sort an array of hex addresses in ascending numeric order.
 *
 * The DAOShip contract requires the `tokens` array in ragequit() to be
 * sorted numerically. JavaScript's default `.sort()` is lexicographic
 * which breaks on hex addresses (e.g. "0x10" < "0x2" lexicographically).
 *
 * Addresses are lowercased before comparison to avoid checksummed-case issues.
 */
/**
 * Case-insensitive address comparison.
 * The database stores addresses lowercase; wallets use EIP-55 mixed case.
 */
export function addressEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

export function sortAddressesNumerically(addresses: string[]): string[] {
  return [...addresses].sort((a, b) => {
    const bigA = BigInt(a.toLowerCase())
    const bigB = BigInt(b.toLowerCase())
    if (bigA < bigB) return -1
    if (bigA > bigB) return 1
    return 0
  })
}

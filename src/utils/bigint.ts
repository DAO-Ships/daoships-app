// ═══════════════════════════════════════════════════════════════════════════
// BigInt Parsing Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely parse a value to BigInt, returning a fallback on failure.
 *
 * @param value    - The value to parse (string, number, BigInt, null, undefined)
 * @param fallback - Fallback value if parsing fails (default 0n)
 * @returns Parsed BigInt or fallback
 */
export function safeBigInt(
  value: string | number | bigint | null | undefined,
  fallback: bigint = 0n,
): bigint {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'bigint') return value

  const str = String(value).trim()
  if (str === '' || !/^\d+$/.test(str)) return fallback

  try {
    return BigInt(str)
  } catch {
    return fallback
  }
}

/**
 * Parse a user input string to BigInt with strict validation.
 * Rejects empty strings, non-numeric content, decimal numbers, and negative numbers.
 *
 * @param input - User input string
 * @returns Parsed BigInt
 * @throws Error if input is invalid
 */
export function parseBigIntInput(input: string): bigint {
  const trimmed = input.trim()

  if (trimmed === '') {
    throw new Error('Input cannot be empty')
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Input must be a non-negative integer')
  }

  return BigInt(trimmed)
}

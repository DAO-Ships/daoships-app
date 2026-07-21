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
  if (str === '') return fallback

  if (!/^\d+$/.test(str)) {
    // A number that arrived as a JavaScript double rather than a string
    // stringifies in exponential notation once it passes 1e21 — every
    // 18-decimal balance of 1000+ tokens does. Expanding it back beats
    // reporting a balance of zero, though the double may already have lost
    // its low digits; values should reach here as strings wherever possible.
    const expanded = expandExponential(str)
    if (expanded === null) return fallback
    return BigInt(expanded)
  }

  try {
    return BigInt(str)
  } catch {
    return fallback
  }
}

/**
 * Expand exponential notation ("1e+21", "1.5e3") into a plain integer string.
 *
 * @returns The integer digits, or null if the input is not exponential
 *          notation or does not denote a whole number.
 */
function expandExponential(str: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(str)
  if (!match) return null

  const [, whole, fraction = '', exponent] = match
  const shift = parseInt(exponent, 10)
  if (fraction.length > shift) return null // Not a whole number

  return whole + fraction.padEnd(shift, '0')
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

// ═══════════════════════════════════════════════════════════════════════════
// Number & Token Formatting Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default number of decimals for ERC-20 tokens.
 */
const DEFAULT_DECIMALS = 18

/**
 * Format a BigInt token amount into a human-readable display string.
 *
 * @param amount      - Raw token amount as BigInt (e.g. 1000000000000000000n for 1 token)
 * @param decimals    - Token decimals (default 18)
 * @param maxDecimals - Maximum decimal places to show (default 4)
 * @param minDecimals - Minimum decimal places to show (default 3)
 * @returns Formatted string, e.g. "1.000" or "0.712"
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = DEFAULT_DECIMALS,
  maxDecimals: number = 4,
  minDecimals: number = 3,
): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = amount / divisor
  const remainder = amount % divisor

  if (remainder === 0n) {
    if (minDecimals > 0) {
      return `${whole}.${'0'.repeat(minDecimals)}`
    }
    return whole.toString()
  }

  // Pad the fractional part to `decimals` length, then truncate to `maxDecimals`
  const fracStr = remainder.toString().padStart(decimals, '0').slice(0, maxDecimals)

  // Remove trailing zeroes, but keep at least `minDecimals` places
  let trimmed = fracStr.replace(/0+$/, '')
  if (trimmed.length < minDecimals) {
    trimmed = fracStr.slice(0, minDecimals)
  }

  return `${whole}.${trimmed}`
}

/**
 * Parse a human-readable token amount string into a BigInt.
 *
 * @param amount   - Display string, e.g. "1.5" or "100"
 * @param decimals - Token decimals (default 18)
 * @returns Raw BigInt value
 */
export function parseTokenAmount(
  amount: string,
  decimals: number = DEFAULT_DECIMALS,
): bigint {
  const trimmed = amount.trim()
  if (trimmed === '' || trimmed === '.') {
    return 0n
  }

  const parts = trimmed.split('.')
  const wholePart = parts[0] || '0'
  let fracPart = parts[1] || ''

  // Truncate or pad fractional part to match token decimals
  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals)
  } else {
    fracPart = fracPart.padEnd(decimals, '0')
  }

  const combined = wholePart + fracPart
  return BigInt(combined)
}

/**
 * Parsed proposal details from the JSON `details` field.
 */
export interface ParsedProposalDetails {
  title: string
  description: string
  type?: string
  discussionUrl?: string
}

/**
 * Parse the proposal `details` field.
 * Details may be JSON `{"title":"...","description":"...","type":"...","discussionUrl":"..."}` or plain text.
 */
export function parseProposalDetails(details: string | null): ParsedProposalDetails {
  if (!details) return { title: 'Untitled Proposal', description: '' }

  try {
    const parsed = JSON.parse(details)
    if (parsed && typeof parsed === 'object') {
      return {
        title: parsed.title || 'Untitled Proposal',
        description: parsed.description || '',
        type: typeof parsed.type === 'string' ? parsed.type : undefined,
        discussionUrl: typeof parsed.discussionUrl === 'string' ? parsed.discussionUrl : undefined,
      }
    }
  } catch {
    // Not JSON — treat as plain text
  }

  const firstLine = details.split('\n')[0]?.trim()
  return {
    title: firstLine || 'Untitled Proposal',
    description: details,
  }
}

/**
 * Format a number with comma-separated thousands.
 *
 * @param n - The number to format
 * @returns Formatted string, e.g. "1,234,567"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Format a number in compact notation (1.2K, 3.4M, etc.).
 *
 * @param n - The number to format
 * @returns Compact string, e.g. "1.2K" or "3.4M"
 */
export function formatCompactNumber(n: number): string {
  if (Math.abs(n) < 1000) {
    return n.toString()
  }

  const tiers = [
    { threshold: 1e12, suffix: 'T' },
    { threshold: 1e9, suffix: 'B' },
    { threshold: 1e6, suffix: 'M' },
    { threshold: 1e3, suffix: 'K' },
  ]

  for (const tier of tiers) {
    if (Math.abs(n) >= tier.threshold) {
      const scaled = n / tier.threshold
      // Show one decimal place, remove trailing .0
      const formatted = scaled.toFixed(1).replace(/\.0$/, '')
      return `${formatted}${tier.suffix}`
    }
  }

  return n.toString()
}

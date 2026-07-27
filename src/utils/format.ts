// ═══════════════════════════════════════════════════════════════════════════
// Number & Token Formatting Utilities
// ═══════════════════════════════════════════════════════════════════════════

import { safeBigInt } from './bigint'
import { markUntrusted, type Untrusted } from '@/types/untrusted'

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
  amount: bigint | number | string,
  decimals: number = DEFAULT_DECIMALS,
  maxDecimals: number = 4,
  minDecimals: number = 3,
): string {
  // Resilient against malformed indexer strings — a bad value renders as 0 rather
  // than throwing in a render body and tripping the app-wide ErrorBoundary.
  const amt = typeof amount === 'bigint' ? amount : safeBigInt(amount)
  const dec = Number(decimals)
  const divisor = 10n ** BigInt(dec)
  const whole = amt / divisor
  const remainder = amt % divisor

  if (remainder === 0n) {
    if (minDecimals > 0) {
      return `${whole}.${'0'.repeat(minDecimals)}`
    }
    return whole.toString()
  }

  // Pad the fractional part to `decimals` length, then truncate to `maxDecimals`
  const fracStr = remainder.toString().padStart(dec, '0').slice(0, maxDecimals)

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
  if (trimmed.startsWith('-')) {
    throw new Error('Negative amounts not allowed')
  }
  if ((trimmed.match(/\./g) || []).length > 1) {
    throw new Error('Invalid number format')
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
  /** Attacker-authored. Escaped by React when rendered as a JSX child. */
  title: Untrusted<string>
  /** Attacker-authored. Escaped by React when rendered as a JSX child. */
  description: Untrusted<string>
  /** Attacker-authored — never branch on this to choose an address or amount. */
  type?: Untrusted<string>
  /** Scheme-validated (`http(s)` only) but the rest of the URL is attacker-chosen. */
  discussionUrl?: Untrusted<string>
}

/**
 * Parse the proposal `details` field.
 * Details may be JSON `{"title":"...","description":"...","type":"...","discussionUrl":"..."}` or plain text.
 *
 * Validating the *shape* does not make the *contents* trustworthy, so every
 * string returned stays marked. The input is required to be marked too: that is
 * what stops a caller from passing something it never got from the indexer and
 * quietly laundering it into a `ParsedProposalDetails`.
 */
export function parseProposalDetails(
  details: Untrusted<string> | null | undefined,
): ParsedProposalDetails {
  // Our own fallback literals are marked too. The field is uniformly hostile as
  // far as consumers are concerned, and a union of trusted/untrusted strings
  // would buy nothing while making every call site branch.
  if (!details) {
    return { title: markUntrusted('Untitled Proposal'), description: markUntrusted('') }
  }

  try {
    const parsed: unknown = JSON.parse(details)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const p = parsed as Record<string, unknown>
      // All fields MUST be strings — never pass non-string values through to JSX
      // (renders like `Objects are not valid as a React child` crash the list).
      const title = typeof p.title === 'string' && p.title.trim()
        ? p.title
        : 'Untitled Proposal'
      const description = typeof p.description === 'string' ? p.description : ''
      const type = typeof p.type === 'string' ? p.type : undefined
      const discussionUrl =
        typeof p.discussionUrl === 'string' && /^https?:\/\//i.test(p.discussionUrl)
          ? p.discussionUrl
          : undefined
      return {
        title: markUntrusted(title),
        description: markUntrusted(description),
        type: type === undefined ? undefined : markUntrusted(type),
        discussionUrl: discussionUrl === undefined ? undefined : markUntrusted(discussionUrl),
      }
    }
  } catch {
    // Not JSON — treat as plain text
  }

  const firstLine = details.split('\n')[0]?.trim()
  return {
    title: markUntrusted(firstLine || 'Untitled Proposal'),
    description: markUntrusted(details as string),
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
 * Convert a basis-points value (0-10000) to a percentage number.
 *
 * Governance fields like `quorum_percent` and `min_retention_percent` are
 * stored as BIGINT basis points on the indexer (10000 bps = 100%). These are
 * always small enough to fit in a Number, but we still parse via BigInt first
 * so that unexpected large values don't silently lose precision.
 *
 * @param bps - Basis points as a string, number, or BigInt
 * @returns Percentage as a Number, e.g. 12.34 for 1234 bps
 */
export function bpsToPercent(bps: string | number | bigint | null | undefined): number {
  if (bps === null || bps === undefined) return 0
  let n: bigint
  try {
    n = typeof bps === 'bigint' ? bps : BigInt(String(bps).trim() || '0')
  } catch {
    return 0
  }
  // bps is always 0-10000, well within Number precision.
  return Number(n) / 100
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

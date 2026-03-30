// ═══════════════════════════════════════════════════════════════════════════
// Time & Duration Formatting Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Duration broken down into discrete units.
 */
export interface Duration {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * Convert a total number of seconds into a structured Duration object.
 *
 * @param totalSeconds - Total seconds to decompose
 * @returns Duration with days, hours, minutes, seconds
 */
export function secondsToDuration(totalSeconds: number): Duration {
  const abs = Math.max(0, Math.floor(totalSeconds))

  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = abs % 60

  return { days, hours, minutes, seconds }
}

/**
 * Format a duration in seconds as a human-readable string.
 * Shows the two most significant non-zero units.
 *
 * @param totalSeconds - Duration in seconds
 * @returns e.g. "3 days, 2 hours" or "45 minutes, 10 seconds"
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0 seconds'

  const { days, hours, minutes, seconds } = secondsToDuration(totalSeconds)

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`)
  if (seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`)

  // Show up to two parts for readability
  return parts.slice(0, 2).join(', ')
}

/**
 * Format a countdown to a target timestamp in compact notation.
 *
 * @param targetTimestamp - Unix timestamp in seconds (or milliseconds) of the target time
 * @returns e.g. "2h 15m 30s" or "0s" if past
 */
export function formatCountdown(targetTimestamp: number): string {
  // Auto-detect seconds vs milliseconds
  const targetMs = targetTimestamp > 1e12 ? targetTimestamp : targetTimestamp * 1000
  const remaining = Math.max(0, Math.floor((targetMs - Date.now()) / 1000))

  if (remaining <= 0) return '0s'

  const { days, hours, minutes, seconds } = secondsToDuration(remaining)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0) parts.push(`${seconds}s`)

  return parts.join(' ')
}

/**
 * Parse a human-readable duration string to seconds.
 *
 * Supports formats like "3 days", "12 hours", "30 minutes", "1h", "3 d",
 * or plain numeric strings (treated as seconds).
 *
 * @param input - Duration string to parse
 * @returns Number of seconds, or null if the input is empty or unparseable
 */
export function parseDurationToSeconds(input: string): number | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  // Plain number = seconds
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)

  const match = trimmed.match(
    /^(\d+)\s*(days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|s|m|h|d)$/,
  )
  if (!match) return null

  const value = parseInt(match[1], 10)
  const unit = match[2]

  if (unit.startsWith('d')) return value * 86400
  if (unit.startsWith('h')) return value * 3600
  if (unit.startsWith('m')) return value * 60
  return value
}

/**
 * Format a past timestamp as relative time.
 *
 * @param timestamp - Unix timestamp in seconds (or milliseconds)
 * @returns e.g. "3 days ago", "just now"
 */
export function formatTimeAgo(timestamp: number): string {
  // Auto-detect seconds vs milliseconds
  const targetMs = timestamp > 1e12 ? timestamp : timestamp * 1000
  const elapsed = Math.floor((Date.now() - targetMs) / 1000)

  if (elapsed < 5) return 'just now'
  if (elapsed < 60) return `${elapsed} seconds ago`
  if (elapsed < 120) return '1 minute ago'
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} minutes ago`
  if (elapsed < 7200) return '1 hour ago'
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} hours ago`
  if (elapsed < 172800) return '1 day ago'
  if (elapsed < 2592000) return `${Math.floor(elapsed / 86400)} days ago`
  if (elapsed < 5184000) return '1 month ago'
  if (elapsed < 31536000) return `${Math.floor(elapsed / 2592000)} months ago`
  if (elapsed < 63072000) return '1 year ago'
  return `${Math.floor(elapsed / 31536000)} years ago`
}

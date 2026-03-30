// ═══════════════════════════════════════════════════════════════════════════
// Safe JSON Content Parsing Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely parse a JSON string, returning a plain object or null.
 * Returns null for arrays, primitives, invalid JSON, null, and undefined.
 *
 * @param json - JSON string to parse
 * @returns Parsed object or null
 */
export function safeJsonParse(json: string | null | undefined): Record<string, unknown> | null {
  if (json === null || json === undefined) return null

  try {
    const parsed = JSON.parse(json)
    // Only accept plain objects
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Safely extract a string field from a parsed object.
 *
 * @param obj      - The object to read from
 * @param key      - The field name
 * @param fallback - Fallback value if field is missing or not a string (default '')
 * @returns The string value or fallback
 */
export function safeString(
  obj: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string = '',
): string {
  if (!obj || typeof obj !== 'object') return fallback
  const value = obj[key]
  if (typeof value !== 'string') return fallback
  return value
}

/**
 * Safely get entries from a parsed object, excluding prototype properties.
 *
 * @param obj - The object to read entries from
 * @returns Array of [key, value] pairs (own enumerable only)
 */
export function safeEntries(
  obj: Record<string, unknown> | null | undefined,
): Array<[string, unknown]> {
  if (!obj || typeof obj !== 'object') return []
  return Object.keys(obj)
    .filter((key) => Object.prototype.hasOwnProperty.call(obj, key))
    .map((key) => [key, obj[key]])
}

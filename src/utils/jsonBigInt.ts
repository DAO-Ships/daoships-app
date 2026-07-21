// ═══════════════════════════════════════════════════════════════════════════
// JSON Big-Integer Preservation
//
// PostgREST serializes numeric/bigint columns as bare JSON numbers, so
// JSON.parse turns them into doubles. Token balances are 18-decimal integers:
// 1000 shares is 1e21, which exceeds Number.MAX_SAFE_INTEGER, so the value
// both loses precision AND stringifies as "1e+21" — which every downstream
// BigInt parse rejects, rendering the balance as 0.
//
// quoteUnsafeIntegers() rewrites the raw response body before it is parsed,
// quoting exactly those integer literals that a double cannot represent
// faithfully. Small numbers (durations, basis points, counts) are left as
// numbers so existing call sites keep the types they expect.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when `token` (a JSON integer literal) cannot survive a round trip
 * through a JavaScript number.
 */
function isLossyInteger(token: string): boolean {
  if (!/^-?\d+$/.test(token)) return false
  return String(Number(token)) !== token
}

/**
 * Quote every integer literal in a JSON document that would lose precision as
 * a double, leaving the rest of the document byte-identical.
 *
 * String contents are never touched — the scanner tracks string state and
 * escapes rather than pattern-matching the document as a whole, so digits
 * inside names, descriptions, and hashes are safe.
 *
 * @param json - Raw JSON text
 * @returns JSON text where oversized integers are string-encoded
 */
export function quoteUnsafeIntegers(json: string): string {
  let out = ''
  let i = 0
  let inString = false

  while (i < json.length) {
    const ch = json[i]

    if (inString) {
      out += ch
      if (ch === '\\') {
        // Copy the escaped character verbatim so an escaped quote can't end the string
        i++
        if (i < json.length) out += json[i]
      } else if (ch === '"') {
        inString = false
      }
      i++
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }

    // A number literal can only start with a digit or a minus sign outside a string
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let end = i
      while (end < json.length && /[-+.eE0-9]/.test(json[end])) end++
      const token = json.slice(i, end)
      out += isLossyInteger(token) ? `"${token}"` : token
      i = end
      continue
    }

    out += ch
    i++
  }

  return out
}

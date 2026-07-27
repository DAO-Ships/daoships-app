// ═══════════════════════════════════════════════════════════════════════════
// Untrusted<T> — compile-time marking for attacker-authored indexer data
//
// `submitProposal` is `external payable` with no membership check, and
// `proposalOffering` is commonly 0. Any funded address can therefore write
// arbitrary text into `ds_proposals.details`. `Poster` tags are permissionless,
// so `ds_records.content_json` is equally open. Both are read on nearly every
// screen, and `ds_proposals.details` is the first field an integrating agent
// touches.
//
// React escapes by default, so the immediate XSS risk is largely handled. The
// risks this type is actually for are the ones escaping does not cover:
//
//   - the string being *interpreted* rather than displayed — used to pick an
//     address, an amount, or a method to call
//   - the string reaching an LLM's context window as if it were instruction
//   - the string being handed to an API that does not escape (a URL, a header,
//     `dangerouslySetInnerHTML`, a wallet prompt)
//
// The brand costs nothing at runtime — it erases entirely — but it makes every
// consumption site say out loud that it knows the value is hostile.
//
// This is a *marking* discipline, not a sanitiser. `unwrapUntrusted` does not
// clean anything. Rendering safely is still the caller's job; see
// /docs/developers/frontend-integration.
// ═══════════════════════════════════════════════════════════════════════════

declare const untrustedBrand: unique symbol

/**
 * A value that originated outside our trust boundary.
 *
 * **Know exactly what this enforces, because it is not what it looks like.**
 * `Untrusted<T>` is an intersection, so the assignability is one-directional:
 *
 *   takesPlain(marked)   // ALLOWED  — marked values still are their base type
 *   takesMarked(plain)   // BLOCKED  — a plain value cannot fabricate the brand
 *
 * So it does **not** stop hostile data being used where a plain string is
 * expected, and it will not make existing call sites light up. What it does is
 * let a function *demand* the mark:
 *
 *   function parse(details: Untrusted<string>) // callers must have a marked source
 *
 * That is the whole enforcement mechanism. Marking a field alone changes
 * nothing; the value appears when a consumer's signature requires the mark, and
 * every caller then has to prove where its input came from.
 *
 * Treat this as a directional contract — "this data came from outside, and this
 * function knows how to handle that" — not as a containment barrier. Escaping
 * and validation still happen at the sink.
 *
 * A fully opaque brand (`{ readonly [b]: T }`) *would* force an unwrap at every
 * use, but it breaks `.length`, `.trim()`, template literals and JSX children,
 * which is a large amount of churn for data whose sinks are already validated.
 */
export type Untrusted<T> = T & { readonly [untrustedBrand]: true }

/**
 * Mark a value as attacker-authored.
 *
 * Call this at the trust boundary — where a row leaves an indexer service —
 * and nowhere else. Marking late defeats the purpose: the sites between the
 * boundary and the mark are exactly the ones that were never audited.
 *
 * A cast is required here precisely because the brand cannot be fabricated by
 * assignment. That asymmetry is the point: creating untrusted data is a
 * deliberate act, so `markUntrusted` is the only place it happens.
 */
export function markUntrusted<T>(value: T): Untrusted<T> {
  return value as Untrusted<T>
}

/** Mark a nullable value, preserving null and undefined. */
export function markUntrustedMaybe<T>(value: T | null | undefined): Untrusted<T> | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  return markUntrusted(value)
}

/**
 * Drop the mark, having decided this use is safe.
 *
 * The `reason` argument is not used at runtime. It exists so the call site has
 * to state its justification, and so `grep -rn "unwrapUntrusted"` produces an
 * audit list of every place hostile data is consumed.
 *
 * Safe reasons look like: rendering as a JSX child (React escapes), measuring
 * length, or passing to a parser that validates before returning.
 *
 * Unsafe: interpolating into a URL or HTML string, using it to select an
 * address or amount, or putting it in a prompt.
 */
export function unwrapUntrusted<T>(value: Untrusted<T>, reason: string): T {
  void reason
  return value as T
}

/** Unwrap a nullable marked value, preserving null and undefined. */
export function unwrapUntrustedMaybe<T>(
  value: Untrusted<T> | null | undefined,
  reason: string,
): T | null | undefined {
  return value == null ? value : unwrapUntrusted(value, reason)
}

/**
 * True when a marked string is absent or contains only whitespace.
 *
 * A convenience so the common emptiness check does not need an unwrap, which
 * would otherwise add noise to the audit list that `unwrapUntrusted` produces.
 */
export function isBlankUntrusted(value: Untrusted<string> | null | undefined): boolean {
  return value == null || value.trim().length === 0
}

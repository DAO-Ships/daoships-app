// ═══════════════════════════════════════════════════════════════════════════
// pluginErrors — contract-error → friendly-copy mapping shared by navigator plugins
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a thrown contract error to friendly copy by matching the navigator's custom-error
 * names against the error message. Each plugin supplies its own ERROR_MAP; unmatched
 * errors fall through to the raw message.
 */
export function mapContractError(err: unknown, errorMap: Record<string, string>): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(errorMap)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

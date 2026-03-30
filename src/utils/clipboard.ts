// ═══════════════════════════════════════════════════════════════════════════
// Clipboard Utility
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Copy text to the system clipboard.
 *
 * @param text - The string to copy
 * @returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

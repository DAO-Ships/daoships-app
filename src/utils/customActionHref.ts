// ═══════════════════════════════════════════════════════════════════════════
// customActionHref — deep-link into the custom-action proposal form
// ───────────────────────────────────────────────────────────────────────────
// Shared by every navigator's proposal builder (budget / vesting / timelock /
// subscription / sanction). They all pre-encode one custom action and hand off to
// the proposal form via the same query-param contract — this is that contract.
// ═══════════════════════════════════════════════════════════════════════════

export interface CustomActionProposal {
  /** Target contract address. */
  to: string
  /** ABI-encoded calldata. */
  data: string
  /** Short human-readable summary shown in the form/sidebar. */
  summary: string
  /** Prefilled proposal title. */
  title: string
}

/**
 * Build a relative `/dao/:daoId/proposals/new?...` href that pre-seeds the custom-action
 * proposal form with a single action (value 0 — governance calls never send native value).
 */
export function buildCustomActionHref(daoId: string, action: CustomActionProposal): string {
  const params = new URLSearchParams({
    type: 'custom',
    customTo: action.to,
    customValue: '0',
    customData: action.data,
    customSummary: action.summary,
    customTitle: action.title,
  })
  return `/dao/${daoId}/proposals/new?${params.toString()}`
}

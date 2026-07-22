// ═══════════════════════════════════════════════════════════════════════════
// Proposal Type Utilities — Shared type labels, colors, and inference
// ═══════════════════════════════════════════════════════════════════════════

import { parseProposalDetails } from '@/utils/format'
import { decodeProposalActions } from '@/services/utils/ProposalDecoder'

export const PROPOSAL_TYPE_COLORS: Record<string, string> = {
  funding: 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
  membership: 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400',
  governance_config: 'bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  profile_update: 'bg-cyan-50 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
  announcement: 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  navigator: 'bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  // Alias: pre-2026-06 proposals stored 'navigator_add' regardless of intent
  navigator_add: 'bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  custom: 'bg-dao-surface text-dao-text-muted',
  signal: 'bg-dao-surface text-dao-text-muted',
}

export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  funding: 'Funding',
  membership: 'Membership',
  governance_config: 'Governance',
  profile_update: 'Profile',
  announcement: 'Announcement',
  navigator: 'Navigator',
  navigator_add: 'Navigator',
  custom: 'Custom',
  signal: 'Signal',
}

/**
 * Get the proposal type from the details JSON, or infer it from decoded actions.
 * Returns { type, label, color } or null if unknown.
 */
export function getProposalType(
  details: string | null | undefined,
  proposalData?: string | null,
  daoId?: string,
): {
  type: string
  label: string
  color: string
} | null {
  // Try explicit type from details JSON first
  const parsed = parseProposalDetails(details ?? null)
  if (parsed.type && PROPOSAL_TYPE_LABELS[parsed.type]) {
    return {
      type: parsed.type,
      label: PROPOSAL_TYPE_LABELS[parsed.type],
      color: PROPOSAL_TYPE_COLORS[parsed.type] ?? PROPOSAL_TYPE_COLORS.custom,
    }
  }

  // Infer from decoded actions
  if (proposalData && proposalData !== '0x') {
    const actions = decodeProposalActions(proposalData, daoId)
    if (actions.length === 0) return { type: 'signal', label: 'Signal', color: PROPOSAL_TYPE_COLORS.signal }

    // Check action types to infer proposal type
    for (const action of actions) {
      if (action.type === 'transfer') return { type: 'funding', label: 'Funding', color: PROPOSAL_TYPE_COLORS.funding }
      if (action.type === 'mintShares' || action.type === 'burnShares' || action.type === 'mintLoot' || action.type === 'burnLoot') {
        return { type: 'membership', label: 'Membership', color: PROPOSAL_TYPE_COLORS.membership }
      }
      if (action.type === 'setGovernanceConfig') return { type: 'governance_config', label: 'Governance', color: PROPOSAL_TYPE_COLORS.governance_config }
      if (action.type === 'setNavigators') return { type: 'navigator', label: 'Navigator', color: PROPOSAL_TYPE_COLORS.navigator }
      if (action.type === 'setGuildTokens') return { type: 'custom', label: 'Guild Tokens', color: PROPOSAL_TYPE_COLORS.custom }
      if (action.type === 'posterPost') {
        const tag = (action.details as Record<string, unknown>)?.tag as string | undefined
        if (tag?.includes('profile')) return { type: 'profile_update', label: 'Profile', color: PROPOSAL_TYPE_COLORS.profile_update }
        if (tag?.includes('announcement')) return { type: 'announcement', label: 'Announcement', color: PROPOSAL_TYPE_COLORS.announcement }
      }
    }

    return { type: 'custom', label: 'Custom', color: PROPOSAL_TYPE_COLORS.custom }
  }

  // Signal proposal (no data)
  if (!proposalData || proposalData === '0x') {
    return { type: 'signal', label: 'Signal', color: PROPOSAL_TYPE_COLORS.signal }
  }

  return null
}

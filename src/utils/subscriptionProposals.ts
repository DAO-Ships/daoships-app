// ═══════════════════════════════════════════════════════════════════════════
// subscriptionProposals — governance-proposal deep-links for the SubscriptionNavigator
// ───────────────────────────────────────────────────────────────────────────
// enroll / enrollBatch / pause / unpause / withdrawStuckTokens are avatar-only on the
// navigator, so they execute as DAOShip governance proposals (the inner action targets
// the navigator and arrives as msg.sender == avatar). We pre-encode a single custom
// action and deep-link into the custom-action proposal form (same contract as the others).
//
// Register/Revoke are setNavigators([nav],[2|0]) — use the navigator proposal form
// (addAddress/addPermission deep-link), not these custom actions.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import SubscriptionNavigatorABI from '@/config/abi/SubscriptionNavigator.json'
import { buildCustomActionHref } from './customActionHref'

const subIface = new quais.Interface(SubscriptionNavigatorABI)

export interface SubscriptionProposalAction {
  to: string
  data: string
  summary: string
  title: string
}

/** enroll(member) — grant one complimentary period. Reverts AlreadyEnrolled. */
export function buildEnrollAction(navigatorAddress: string, member: string): SubscriptionProposalAction {
  return {
    to: navigatorAddress,
    data: subIface.encodeFunctionData('enroll', [member]),
    summary: 'Enroll a subscription member (1 free period)',
    title: 'Enroll a subscription member',
  }
}

/** enrollBatch(members[]) — enroll a roster; already-enrolled members are skipped. */
export function buildEnrollBatchAction(navigatorAddress: string, members: string[]): SubscriptionProposalAction {
  return {
    to: navigatorAddress,
    data: subIface.encodeFunctionData('enrollBatch', [members]),
    summary: `Enroll ${members.length} subscription members`,
    title: 'Enroll subscription members (batch)',
  }
}

/** pause() — halt payFee/collectFee. */
export function buildSubscriptionPauseAction(navigatorAddress: string): SubscriptionProposalAction {
  return {
    to: navigatorAddress,
    data: subIface.encodeFunctionData('pause', []),
    summary: 'Pause subscription navigator',
    title: 'Pause subscription navigator (halt dues + collection)',
  }
}

/** unpause() — resume payFee/collectFee. */
export function buildSubscriptionUnpauseAction(navigatorAddress: string): SubscriptionProposalAction {
  return {
    to: navigatorAddress,
    data: subIface.encodeFunctionData('unpause', []),
    summary: 'Unpause subscription navigator',
    title: 'Unpause subscription navigator',
  }
}

/** withdrawStuckTokens(token, to, amount) — recover mis-sent ERC-20. */
export function buildWithdrawStuckTokensAction(
  navigatorAddress: string,
  token: string,
  to: string,
  amount: bigint,
): SubscriptionProposalAction {
  return {
    to: navigatorAddress,
    data: subIface.encodeFunctionData('withdrawStuckTokens', [token, to, amount]),
    summary: 'Recover mis-sent tokens from the subscription navigator',
    title: 'Recover mis-sent tokens',
  }
}

/** Deep-link into the custom-action proposal form, pre-seeded with one action. */
export function buildSubscriptionProposalHref(daoId: string, action: SubscriptionProposalAction): string {
  return buildCustomActionHref(daoId, action)
}

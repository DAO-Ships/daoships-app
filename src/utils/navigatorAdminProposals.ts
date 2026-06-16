// ═══════════════════════════════════════════════════════════════════════════
// navigatorAdminProposals — shared governance deep-links for navigator admin actions
// ───────────────────────────────────────────────────────────────────────────
// pause/unpause and withdrawStuck* are governance/avatar-only on the membership
// navigators (Onboarder, ERC20Tribute, NFTGated). They execute as DAOShip governance
// proposals (a custom action targeting the navigator, arriving as msg.sender == avatar).
// pause()/unpause() share one selector across every navigator, so a minimal interface
// covers all of them without importing per-navigator ABIs.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

const adminIface = new quais.Interface([
  'function pause()',
  'function unpause()',
  'function withdrawStuckETH(address to, uint256 amount)',
  'function withdrawStuckTokens(address token, address to, uint256 amount)',
])

export interface NavigatorAdminAction {
  to: string
  data: string
  summary: string
  title: string
}

/** pause() targeting the navigator — halts onboarding/claims. */
export function buildNavigatorPauseAction(navigatorAddress: string): NavigatorAdminAction {
  return {
    to: navigatorAddress,
    data: adminIface.encodeFunctionData('pause', []),
    summary: 'Pause navigator',
    title: 'Pause navigator',
  }
}

/** unpause() targeting the navigator. */
export function buildNavigatorUnpauseAction(navigatorAddress: string): NavigatorAdminAction {
  return {
    to: navigatorAddress,
    data: adminIface.encodeFunctionData('unpause', []),
    summary: 'Unpause navigator',
    title: 'Unpause navigator',
  }
}

/** withdrawStuckETH(to, amount) — recover native QUAI stuck in the navigator. */
export function buildWithdrawStuckETHAction(
  navigatorAddress: string,
  to: string,
  amount: bigint,
): NavigatorAdminAction {
  return {
    to: navigatorAddress,
    data: adminIface.encodeFunctionData('withdrawStuckETH', [to, amount]),
    summary: 'Recover stuck native QUAI from the navigator',
    title: 'Recover stuck QUAI',
  }
}

/** withdrawStuckTokens(token, to, amount) — recover mis-sent ERC-20 from the navigator. */
export function buildWithdrawStuckTokensAction(
  navigatorAddress: string,
  token: string,
  to: string,
  amount: bigint,
): NavigatorAdminAction {
  return {
    to: navigatorAddress,
    data: adminIface.encodeFunctionData('withdrawStuckTokens', [token, to, amount]),
    summary: 'Recover mis-sent tokens from the navigator',
    title: 'Recover mis-sent tokens',
  }
}

/** Deep-link into the custom-action proposal form, pre-seeded with one admin action. */
export function buildNavigatorAdminHref(daoId: string, action: NavigatorAdminAction): string {
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

// ═══════════════════════════════════════════════════════════════════════════
// budgetProposals — build governance-proposal deep-links for the BudgetNavigator
// ───────────────────────────────────────────────────────────────────────────
// BudgetNavigator's avatar-only actions (createBudget/cancelBudget/updateManager)
// and the vault module wiring (enableModule/disableModule) all execute as DAOShip
// governance proposals — the inner action arrives as `msg.sender == vault == avatar`.
// Rather than re-implement the offering/sponsor/confirm flow, we pre-encode a single
// custom action and deep-link into the existing custom-action proposal form.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import BudgetNavigatorABI from '@/config/abi/BudgetNavigator.json'
import { buildCustomActionHref } from './customActionHref'
import QuaiVaultJson from '@/config/abi/QuaiVault.json'

const budgetIface = new quais.Interface(BudgetNavigatorABI)
const vaultIface = new quais.Interface(QuaiVaultJson.abi)

/** A single pre-encoded action to seed the custom-action proposal form. */
export interface BudgetProposalAction {
  to: string
  data: string
  /** Human label shown in the proposal builder's action summary. */
  summary: string
  /** Default proposal title. */
  title: string
}

/** enableModule(navigator) targeting the vault — grants treasury access. */
export function buildEnableModuleAction(vaultAddress: string, navigatorAddress: string): BudgetProposalAction {
  return {
    to: vaultAddress,
    data: vaultIface.encodeFunctionData('enableModule', [navigatorAddress]),
    summary: 'Enable budget navigator as a vault module',
    title: 'Enable budget navigator (grant treasury access)',
  }
}

/**
 * disableModule(prevModule, navigator) targeting the vault — the nuclear kill switch.
 * `prevModule` must be the module that points at `navigatorAddress` in the vault's
 * linked list (resolve via resolvePrevModule()).
 */
export function buildDisableModuleAction(
  vaultAddress: string,
  navigatorAddress: string,
  prevModule: string,
): BudgetProposalAction {
  return {
    to: vaultAddress,
    data: vaultIface.encodeFunctionData('disableModule', [prevModule, navigatorAddress]),
    summary: 'Disable budget navigator (revoke treasury access)',
    title: 'Disable budget navigator (revoke treasury access)',
  }
}

export interface CreateBudgetParams {
  manager: string
  token: string // ZeroAddress for native QUAI
  allowancePerPeriod: bigint
  totalCeiling: bigint
  periodLength: bigint // seconds
  startTime: bigint // 0 = now
  endTime: bigint // 0 = perpetual
}

/** createBudget(...) targeting the navigator. */
export function buildCreateBudgetAction(
  navigatorAddress: string,
  p: CreateBudgetParams,
): BudgetProposalAction {
  return {
    to: navigatorAddress,
    data: budgetIface.encodeFunctionData('createBudget', [
      p.manager,
      p.token,
      p.allowancePerPeriod,
      p.totalCeiling,
      p.periodLength,
      p.startTime,
      p.endTime,
    ]),
    summary: 'Create recurring budget',
    title: 'Create recurring budget',
  }
}

/** cancelBudget(budgetId) targeting the navigator — irreversible. */
export function buildCancelBudgetAction(navigatorAddress: string, budgetId: bigint): BudgetProposalAction {
  return {
    to: navigatorAddress,
    data: budgetIface.encodeFunctionData('cancelBudget', [budgetId]),
    summary: `Cancel budget #${budgetId}`,
    title: `Cancel budget #${budgetId}`,
  }
}

/** pause() targeting the navigator — freezes ALL disbursement (the fast brake). */
export function buildPauseAction(navigatorAddress: string): BudgetProposalAction {
  return {
    to: navigatorAddress,
    data: budgetIface.encodeFunctionData('pause', []),
    summary: 'Pause budget navigator (freeze all disbursement)',
    title: 'Pause budget navigator (freeze treasury disbursement)',
  }
}

/** unpause() targeting the navigator — resumes disbursement. */
export function buildUnpauseAction(navigatorAddress: string): BudgetProposalAction {
  return {
    to: navigatorAddress,
    data: budgetIface.encodeFunctionData('unpause', []),
    summary: 'Unpause budget navigator (resume disbursement)',
    title: 'Unpause budget navigator (resume disbursement)',
  }
}

/** updateManager(budgetId, newManager) targeting the navigator. */
export function buildUpdateManagerAction(
  navigatorAddress: string,
  budgetId: bigint,
  newManager: string,
): BudgetProposalAction {
  return {
    to: navigatorAddress,
    data: budgetIface.encodeFunctionData('updateManager', [budgetId, newManager]),
    summary: `Change manager for budget #${budgetId}`,
    title: `Change manager for budget #${budgetId}`,
  }
}

/**
 * Build the deep-link into the custom-action proposal form, pre-seeded with one action.
 * Returns a relative path suitable for react-router `<Link to>` / navigate().
 */
export function buildBudgetProposalHref(daoId: string, action: BudgetProposalAction): string {
  return buildCustomActionHref(daoId, action)
}

const SENTINEL_MODULE = '0x0000000000000000000000000000000000000001'

/**
 * Resolve the `prevModule` pointer for disableModule from the vault's linked list.
 * getModulesPaginated returns modules most-recent-first; prevModule is whatever points
 * at the target (or the sentinel if it's the head). Returns null if not enabled.
 */
export async function resolvePrevModule(
  vaultAddress: string,
  navigatorAddress: string,
  provider: quais.Provider,
): Promise<string | null> {
  const vault = new quais.Contract(vaultAddress, QuaiVaultJson.abi, provider)
  const [modules] = await vault.getModulesPaginated(SENTINEL_MODULE, 100)
  const list = (modules as string[]).map((m) => m.toLowerCase())
  const target = navigatorAddress.toLowerCase()
  const i = list.indexOf(target)
  if (i < 0) return null
  return i === 0 ? SENTINEL_MODULE : (modules as string[])[i - 1]
}

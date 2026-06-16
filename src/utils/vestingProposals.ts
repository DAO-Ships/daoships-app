// ═══════════════════════════════════════════════════════════════════════════
// vestingProposals — build governance-proposal deep-links for the VestingNavigator
// ───────────────────────────────────────────────────────────────────────────
// createSchedule / revoke / pause are avatar-only on the navigator, so they execute
// as DAOShip governance proposals (the inner action arrives as msg.sender == avatar).
// We pre-encode a single custom action and deep-link into the custom-action proposal
// form (same query-param contract as budgetProposals).
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import VestingNavigatorABI from '@/config/abi/VestingNavigator.json'
import { buildCustomActionHref } from './customActionHref'

const vestingIface = new quais.Interface(VestingNavigatorABI)

export interface VestingProposalAction {
  to: string
  data: string
  summary: string
  title: string
}

export interface CreateScheduleParams {
  beneficiary: string
  totalAmount: bigint // wei
  startTime: bigint // 0 = now
  cliffDuration: bigint // seconds
  vestingDuration: bigint // seconds
  isLoot: boolean
}

/** createSchedule(...) targeting the navigator. */
export function buildCreateScheduleAction(
  navigatorAddress: string,
  p: CreateScheduleParams,
): VestingProposalAction {
  const kind = p.isLoot ? 'loot' : 'shares'
  return {
    to: navigatorAddress,
    data: vestingIface.encodeFunctionData('createSchedule', [
      p.beneficiary,
      p.totalAmount,
      p.startTime,
      p.cliffDuration,
      p.vestingDuration,
      p.isLoot,
    ]),
    summary: `Create ${kind} vesting schedule`,
    title: `Create ${kind} vesting schedule`,
  }
}

/** revoke(scheduleId) targeting the navigator — freezes accrual (non-destructive). */
export function buildRevokeScheduleAction(navigatorAddress: string, scheduleId: bigint): VestingProposalAction {
  return {
    to: navigatorAddress,
    data: vestingIface.encodeFunctionData('revoke', [scheduleId]),
    summary: `Revoke vesting schedule #${scheduleId}`,
    title: `Revoke vesting schedule #${scheduleId} (freeze accrual)`,
  }
}

/** pause() targeting the navigator — blocks NEW schedules only (claims still work). */
export function buildVestingPauseAction(navigatorAddress: string): VestingProposalAction {
  return {
    to: navigatorAddress,
    data: vestingIface.encodeFunctionData('pause', []),
    summary: 'Pause vesting navigator (block new schedules)',
    title: 'Pause vesting navigator (block new schedules)',
  }
}

/** unpause() targeting the navigator. */
export function buildVestingUnpauseAction(navigatorAddress: string): VestingProposalAction {
  return {
    to: navigatorAddress,
    data: vestingIface.encodeFunctionData('unpause', []),
    summary: 'Unpause vesting navigator',
    title: 'Unpause vesting navigator',
  }
}

// ─── Decode (for proposal previews & voting summaries) ──────────────────────

export type DecodedVestingAction =
  | {
      kind: 'createSchedule'
      beneficiary: string
      totalAmount: bigint // wei (18 decimals)
      startTime: bigint // 0 = at execution
      cliffDuration: bigint // seconds, measured from startTime
      vestingDuration: bigint // seconds, total (cliff is contained within)
      isLoot: boolean
    }
  | { kind: 'revoke'; scheduleId: bigint }

/**
 * Best-effort decode of a custom-action calldata against the VestingNavigator's
 * vesting-specific governance functions (createSchedule / revoke). Selector-based —
 * works without fetching the target's ABI, so a vesting proposal renders a
 * human-readable summary even when the indexer hasn't cached the navigator ABI.
 *
 * Intentionally scoped to vesting-SPECIFIC selectors. Generic admin calls like
 * pause()/unpause() are shared across navigator types and would false-positive on
 * non-vesting targets, so they are left to the generic ABI/known-calldata path.
 *
 * Returns null for any non-vesting / unrecognized calldata.
 */
export function decodeVestingAction(calldata: string | null | undefined): DecodedVestingAction | null {
  if (!calldata || calldata === '0x' || calldata.length < 10) return null
  try {
    const parsed = vestingIface.parseTransaction({ data: calldata })
    if (!parsed) return null
    switch (parsed.name) {
      case 'createSchedule':
        return {
          kind: 'createSchedule',
          beneficiary: parsed.args[0] as string,
          totalAmount: parsed.args[1] as bigint,
          startTime: parsed.args[2] as bigint,
          cliffDuration: parsed.args[3] as bigint,
          vestingDuration: parsed.args[4] as bigint,
          isLoot: parsed.args[5] as boolean,
        }
      case 'revoke':
        return { kind: 'revoke', scheduleId: parsed.args[0] as bigint }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Deep-link into the custom-action proposal form, pre-seeded with one action. */
export function buildVestingProposalHref(daoId: string, action: VestingProposalAction): string {
  return buildCustomActionHref(daoId, action)
}

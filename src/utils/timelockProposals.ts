// ═══════════════════════════════════════════════════════════════════════════
// timelockProposals — build governance-proposal deep-links for the TimelockNavigator
// ───────────────────────────────────────────────────────────────────────────
// queueChange / cancelChange / emergencyCancelAll / pause are avatar-only on the
// navigator, so they execute as DAOShip governance proposals (the inner action targets
// the navigator and arrives as msg.sender == avatar). We pre-encode a single custom
// action and deep-link into the custom-action proposal form (same contract as
// budgetProposals / vestingProposals).
//
// queueChange takes the SAME ABI-encoded governance-config blob as DAOShip.setGovernanceConfig
// — we reuse encodeGovernanceConfig so the queued bytes match exactly.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import TimelockNavigatorABI from '@/config/abi/TimelockNavigator.json'
import { type GovernanceConfig, encodeGovernanceConfig } from '@/services/utils/GovernanceEncoder'
import { buildCustomActionHref } from './customActionHref'

const timelockIface = new quais.Interface(TimelockNavigatorABI)

export interface TimelockProposalAction {
  to: string
  data: string
  summary: string
  title: string
}

/**
 * queueChange(configBytes) targeting the navigator. The config blob is built exactly as
 * a direct setGovernanceConfig would be — the timelock just delays it.
 */
export function buildQueueChangeAction(
  navigatorAddress: string,
  config: GovernanceConfig,
): TimelockProposalAction {
  const configBytes = encodeGovernanceConfig(config)
  return {
    to: navigatorAddress,
    data: timelockIface.encodeFunctionData('queueChange', [configBytes]),
    summary: 'Queue governance-config change (timelock)',
    title: 'Queue governance-config change (timelock delay)',
  }
}

/** cancelChange(changeId) targeting the navigator — cancel a pending change. */
export function buildCancelChangeAction(navigatorAddress: string, changeId: bigint): TimelockProposalAction {
  return {
    to: navigatorAddress,
    data: timelockIface.encodeFunctionData('cancelChange', [changeId]),
    summary: `Cancel timelock change #${changeId}`,
    title: `Cancel timelock change #${changeId}`,
  }
}

/** emergencyCancelAll() targeting the navigator — cancel ALL pending + pause queueing. */
export function buildEmergencyCancelAllAction(navigatorAddress: string): TimelockProposalAction {
  return {
    to: navigatorAddress,
    data: timelockIface.encodeFunctionData('emergencyCancelAll', []),
    summary: 'Emergency cancel ALL pending timelock changes',
    title: 'Emergency cancel all timelock changes + pause',
  }
}

/** pause() targeting the navigator — block NEW queues (execution of queued changes still works). */
export function buildTimelockPauseAction(navigatorAddress: string): TimelockProposalAction {
  return {
    to: navigatorAddress,
    data: timelockIface.encodeFunctionData('pause', []),
    summary: 'Pause timelock (block new queues)',
    title: 'Pause timelock navigator (block new queues)',
  }
}

/** unpause() targeting the navigator. */
export function buildTimelockUnpauseAction(navigatorAddress: string): TimelockProposalAction {
  return {
    to: navigatorAddress,
    data: timelockIface.encodeFunctionData('unpause', []),
    summary: 'Unpause timelock (allow new queues)',
    title: 'Unpause timelock navigator',
  }
}

/** Deep-link into the custom-action proposal form, pre-seeded with one action. */
export function buildTimelockProposalHref(daoId: string, action: TimelockProposalAction): string {
  return buildCustomActionHref(daoId, action)
}

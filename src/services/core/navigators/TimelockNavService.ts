// ═══════════════════════════════════════════════════════════════════════════
// TimelockNavService — TimelockNavigator (GOVERNOR — delays governance-config changes)
// ───────────────────────────────────────────────────────────────────────────
// Queued changes + their full config bytes come from the indexer (ds_timelock_changes).
// queue/cancel/emergencyCancelAll/pause are avatar-only → governance proposals (deep-links).
// executeChange is PERMISSIONLESS once matured — anyone can crank it directly.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import TimelockNavigatorABI from '@/config/abi/TimelockNavigator.json'
import type { TimelockNavigatorConfig } from './types'

class TimelockNavService {
  /** Read the TimelockNavigator's config: change count, pause flag, delay, expiry window. */
  async getTimelockConfig(navigatorAddress: string): Promise<TimelockNavigatorConfig> {
    const contract = new quais.Contract(navigatorAddress, TimelockNavigatorABI, baseService.getProvider())

    const [changeCount, paused, delay, expiryWindow, daoShip, navigatorType] = await Promise.all([
      contract.changeCount(),
      contract.paused(),
      contract.delay(),
      contract.expiryWindow(),
      contract.daoShip(),
      contract.navigatorType(),
    ])

    return {
      changeCount: BigInt(changeCount),
      paused: Boolean(paused),
      delay: BigInt(delay),
      expiryWindow: BigInt(expiryWindow),
      daoShip: String(daoShip),
      navigatorType: String(navigatorType),
    }
  }

  /** Is this change executable right now? (Authoritative on-chain preflight.) */
  async timelockIsExecutable(navigatorAddress: string, changeId: bigint): Promise<boolean> {
    const contract = new quais.Contract(navigatorAddress, TimelockNavigatorABI, baseService.getProvider())
    return Boolean(await contract.isExecutable(changeId))
  }

  /**
   * Execute a matured queued change — PERMISSIONLESS (anyone can crank). You MUST pass
   * the exact `governanceConfig` bytes from the indexed row; the hash won't reconstruct
   * them (wrong bytes → ConfigHashMismatch).
   */
  async timelockExecuteChange(
    navigatorAddress: string,
    changeId: bigint,
    governanceConfig: string,
  ): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, TimelockNavigatorABI, baseService.requireSigner())
    const tx = await contract.executeChange(changeId, governanceConfig)
    await confirmTx(tx, { label: 'TimelockNavigator.executeChange' })
  }
}

export const timelockNavService = new TimelockNavService()

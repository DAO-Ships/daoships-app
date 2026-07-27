// ═══════════════════════════════════════════════════════════════════════════
// VestingNavService — VestingNavigator (MANAGER — mints shares/loot on a cliff + linear schedule)
// ───────────────────────────────────────────────────────────────────────────
// Schedules + their static config come from the indexer (ds_vesting_schedules);
// schedules are created/revoked by governance (avatar-only → proposals). On-chain
// we read the LIVE claimable (authoritative preflight) and submit the beneficiary
// claim directly. No escrow — claim() mints vested-but-unclaimed TO THE BENEFICIARY.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import VestingNavigatorABI from '@/config/abi/VestingNavigator.json'
import type { VestingNavigatorConfig } from './types'

class VestingNavService {
  /** Read the VestingNavigator's config: schedule count, pause flag, DAO binding. */
  async getVestingConfig(navigatorAddress: string): Promise<VestingNavigatorConfig> {
    const contract = new quais.Contract(navigatorAddress, VestingNavigatorABI, baseService.getProvider())

    const [scheduleCount, paused, daoShip, navigatorType] = await Promise.all([
      contract.scheduleCount(),
      contract.paused(),
      contract.daoShip(),
      contract.navigatorType(),
    ])

    return {
      scheduleCount: BigInt(scheduleCount),
      paused: Boolean(paused),
      daoShip: String(daoShip),
      navigatorType: String(navigatorType),
    }
  }

  /**
   * Live claimable for one schedule — the authoritative preflight (read fresh before
   * claiming to disable the button when nothing has vested). Mirrors the indexer's
   * derived `claimable`, but on-chain and lag-free.
   */
  async getVestingClaimable(navigatorAddress: string, scheduleId: bigint): Promise<bigint> {
    const contract = new quais.Contract(navigatorAddress, VestingNavigatorABI, baseService.getProvider())
    return BigInt(await contract.claimable(scheduleId))
  }

  /** Live total-vested for one schedule (minted + still-claimable). */
  async getVestingVested(navigatorAddress: string, scheduleId: bigint): Promise<bigint> {
    const contract = new quais.Contract(navigatorAddress, VestingNavigatorABI, baseService.getProvider())
    return BigInt(await contract.vested(scheduleId))
  }

  /** The schedule IDs for a beneficiary (on-chain view). */
  async getVestingSchedules(navigatorAddress: string, beneficiary: string): Promise<bigint[]> {
    const contract = new quais.Contract(navigatorAddress, VestingNavigatorABI, baseService.getProvider())
    const ids = await contract.getSchedules(quais.getAddress(beneficiary))
    return (ids as unknown[]).map((id) => BigInt(id as bigint))
  }

  /**
   * Claim vested-but-unclaimed tokens for a schedule. Callable by the beneficiary OR
   * the avatar; ALWAYS mints to the schedule's beneficiary (never the caller).
   */
  async vestingClaim(navigatorAddress: string, scheduleId: bigint): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, VestingNavigatorABI, baseService.requireSigner())
    const tx = await contract.claim(scheduleId)
    await confirmTx(tx, { label: 'VestingNavigator.claim' })
  }
}

export const vestingNavService = new VestingNavService()

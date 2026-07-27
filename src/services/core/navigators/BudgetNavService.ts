// ═══════════════════════════════════════════════════════════════════════════
// BudgetNavService — BudgetNavigator (MODULE class — treasury disbursement, no DAOShip permission)
// ───────────────────────────────────────────────────────────────────────────
// Authority is being an enabled Zodiac module on the DAO's vault. Budgets and
// their static config come from the indexer (ds_budgets); on-chain we only read
// the LIVE figures (remaining* reset lazily) + paused, and submit manager/admin txs.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import BudgetNavigatorABI from '@/config/abi/BudgetNavigator.json'
import QuaiVaultJson from '@/config/abi/QuaiVault.json'
import type { BudgetNavigatorConfig, BudgetRemaining } from './types'

class BudgetNavService {
  /** Read the BudgetNavigator's immutable config + current budget count + pause flag. */
  async getBudgetConfig(navigatorAddress: string): Promise<BudgetNavigatorConfig> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.getProvider())

    const [budgetCount, paused, minPeriod, maxPeriod, daoShip, navigatorType] = await Promise.all([
      contract.budgetCount(),
      contract.paused(),
      contract.MIN_PERIOD(),
      contract.MAX_PERIOD(),
      contract.daoShip(),
      contract.navigatorType(),
    ])

    return {
      budgetCount: BigInt(budgetCount),
      paused: Boolean(paused),
      minPeriod: BigInt(minPeriod),
      maxPeriod: BigInt(maxPeriod),
      daoShip: String(daoShip),
      navigatorType: String(navigatorType),
    }
  }

  /**
   * Live remaining figures for one budget — both reset/accrue lazily on-chain, so
   * read them fresh before a disburse to disable a too-large amount before it reverts.
   */
  async getBudgetRemaining(navigatorAddress: string, budgetId: bigint): Promise<BudgetRemaining> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.getProvider())
    const [thisPeriod, total] = await Promise.all([
      contract.remainingThisPeriod(budgetId),
      contract.remainingTotal(budgetId),
    ])
    return { thisPeriod: BigInt(thisPeriod), total: BigInt(total) }
  }

  /** Authoritative pause flag (freezes ALL disbursement). */
  async getBudgetPaused(navigatorAddress: string): Promise<boolean> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.getProvider())
    return Boolean(await contract.paused())
  }

  /**
   * Is this navigator currently an enabled module on the given vault? The
   * unforgeable source of truth behind trust_status — confirm before disbursing.
   */
  async isModuleEnabled(vaultAddress: string, navigatorAddress: string): Promise<boolean> {
    const vault = new quais.Contract(vaultAddress, QuaiVaultJson.abi, baseService.getProvider())
    return Boolean(await vault.isModuleEnabled(quais.getAddress(navigatorAddress)))
  }

  /** Disburse a single payout from a budget. Manager-only (reverts otherwise). */
  async budgetDisburse(
    navigatorAddress: string,
    budgetId: bigint,
    to: string,
    amount: bigint,
  ): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.requireSigner())
    const tx = await contract.disburse(budgetId, quais.getAddress(to), amount)
    await confirmTx(tx, { label: 'BudgetNavigator.disburse' })
  }

  /** Batch payroll disbursement (atomic). Manager-only; `to` and `amounts` must align. */
  async budgetDisburseBatch(
    navigatorAddress: string,
    budgetId: bigint,
    to: string[],
    amounts: bigint[],
  ): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.requireSigner())
    const tx = await contract.disburseBatch(budgetId, to.map((a) => quais.getAddress(a)), amounts)
    await confirmTx(tx, { label: 'BudgetNavigator.disburseBatch' })
  }

  /** Freeze ALL disbursement (the fast brake). GOVERNOR navigator or avatar only. */
  async budgetPause(navigatorAddress: string): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.requireSigner())
    const tx = await contract.pause()
    await confirmTx(tx, { label: 'BudgetNavigator.pause' })
  }

  /** Resume disbursement. GOVERNOR navigator or avatar only. */
  async budgetUnpause(navigatorAddress: string): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, BudgetNavigatorABI, baseService.requireSigner())
    const tx = await contract.unpause()
    await confirmTx(tx, { label: 'BudgetNavigator.unpause' })
  }
}

export const budgetNavService = new BudgetNavService()

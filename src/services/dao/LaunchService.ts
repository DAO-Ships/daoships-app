// ═══════════════════════════════════════════════════════════════════════════
// LaunchService — the DAO launch pipeline (vault + tokens + DAOShip in one tx)
// ───────────────────────────────────────────────────────────────────────────
// Estimates and affordability-gates before signing (the navigators are already
// on-chain by this point, so a wallet that can't pay would orphan them), then
// confirms with a longer ceiling since launch is a large multi-deploy transaction.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { estimateGasOrThrow } from '@/services/utils/GasEstimator'
import { confirmTx } from '@/services/utils/TxExecutor'
import { assertAffordable, FALLBACK_LAUNCH_GAS } from '@/services/utils/LaunchGasEstimator'
import DAOShipAndVaultLauncherAbi from '@/config/abi/DAOShipAndVaultLauncher.json'
import { getLauncherContract } from './contracts'

class LaunchService {
  /**
   * Launch a new DAOShip with a new Quai Vault.
   *
   * @param initializationParamsTemplate  ABI-encoded DAOShip setup parameters
   * @param vaultOwners            Addresses that own the vault
   * @param vaultThreshold         Multisig threshold for the vault
   * @param vaultSalt              Salt for CREATE2 vault deployment
   * @param sharesSalt             Salt for CREATE2 shares token deployment
   * @param lootSalt               Salt for CREATE2 loot token deployment
   * @param daoShipSalt            Salt for CREATE2 DAOShip deployment
   * @returns Deployed DAOShip and vault addresses
   */
  async launchDAOShipAndVault(
    initializationParamsTemplate: string,
    shareTokenName: string,
    shareTokenSymbol: string,
    lootTokenName: string,
    lootTokenSymbol: string,
    vaultOwners: string[],
    vaultThreshold: bigint,
    vaultSalt: bigint,
    sharesSalt: bigint,
    lootSalt: bigint,
    daoShipSalt: bigint,
  ): Promise<{ daoShip: string; vault: string }> {
    const launcher = getLauncherContract()

    const launchArgs = [
      initializationParamsTemplate,
      shareTokenName,
      shareTokenSymbol,
      lootTokenName,
      lootTokenSymbol,
      vaultOwners,
      vaultThreshold,
      vaultSalt,
      sharesSalt,
      lootSalt,
      daoShipSalt,
    ]

    // The navigators are already on-chain by this point — a wallet that cannot
    // pay for this transaction would orphan them, so stop before signing.
    const launchGas = await estimateGasOrThrow(
      launcher,
      'launchDAOShipAndVault',
      launchArgs,
      'Launch DAO',
    )
    await assertAffordable(launchGas ?? FALLBACK_LAUNCH_GAS, 'Launch DAO')

    const tx = await launcher.launchDAOShipAndVault(
      initializationParamsTemplate,
      shareTokenName,
      shareTokenSymbol,
      lootTokenName,
      lootTokenSymbol,
      vaultOwners,
      vaultThreshold,
      vaultSalt,
      sharesSalt,
      lootSalt,
      daoShipSalt,
    )
    // Launch is a large, multi-deploy transaction — give it a longer ceiling than the
    // default. The record survives a timeout so a slow confirmation stays recoverable
    // (complementing the CREATE2 hasCodeAt probe the launch flow already uses).
    const receipt = await confirmTx(tx, { step: 'launch', label: 'Launch DAO', timeoutMs: 180_000 })

    // Parse the LaunchDAOShipAndVault event
    const iface = new quais.Interface(DAOShipAndVaultLauncherAbi)
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
        if (parsed?.name === 'LaunchDAOShipAndVault') {
          return {
            daoShip: parsed.args.daoShip as string,
            vault: parsed.args.vault as string,
          }
        }
      } catch {
        // Not this event, continue
      }
    }

    throw new Error('LaunchDAOShipAndVault event not found in transaction receipt')
  }
}

export const launchService = new LaunchService()

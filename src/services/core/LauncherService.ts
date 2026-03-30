import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import DAOShipAndVaultLauncherABI from '@/config/abi/DAOShipAndVaultLauncher.json'

// ═══════════════════════════════════════════════════════════════════════════
// LauncherService - DAO creation via DAOShipAndVaultLauncher
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parameters for launching a new DAOShip DAO with a Quai Vault.
 *
 * Matches the contract signature:
 *   launchDAOShipAndVault(
 *     bytes initializationParamsTemplate,
 *     string shareTokenName, string shareTokenSymbol,
 *     string lootTokenName, string lootTokenSymbol,
 *     address[] vaultOwners, uint256 vaultThreshold,
 *     uint256 vaultSalt, uint256 sharesSalt, uint256 lootSalt, uint256 daoShipSalt
 *   )
 */
export interface LaunchDAOShipAndVaultParams {
  /** ABI-encoded DAOShip setUp params template (avatar replaced by factory) */
  initializationParamsTemplate: string
  /** Share token name */
  shareTokenName: string
  /** Share token symbol */
  shareTokenSymbol: string
  /** Loot token name */
  lootTokenName: string
  /** Loot token symbol */
  lootTokenSymbol: string
  /** Quai Vault owner addresses */
  vaultOwners: string[]
  /** Quai Vault approval threshold */
  vaultThreshold: bigint
  /** CREATE2 salt for the vault */
  vaultSalt: bigint
  /** CREATE2 salt for the shares token proxy */
  sharesSalt: bigint
  /** CREATE2 salt for the loot token proxy */
  lootSalt: bigint
  /** CREATE2 salt for the DAOShip proxy */
  daoShipSalt: bigint
}

/**
 * Result from a successful launch.
 */
export interface LaunchResult {
  /** The deployed DAOShip (DAO) address */
  daoShipAddress: string
  /** The deployed vault (Quai Vault) address */
  vaultAddress: string
}

/**
 * Handles DAO creation through the DAOShipAndVaultLauncher contract.
 */
class LauncherService {

  private getLauncherAddress(): string {
    const addr = import.meta.env.VITE_DAOSHIP_AND_VAULT_LAUNCHER
    if (!addr) {
      throw new Error('VITE_DAOSHIP_AND_VAULT_LAUNCHER environment variable is not set')
    }
    return addr
  }

  private getWriteContract(): quais.Contract {
    return new quais.Contract(
      this.getLauncherAddress(),
      DAOShipAndVaultLauncherABI,
      baseService.requireSigner(),
    )
  }

  /**
   * Launch a new DAOShip DAO with a freshly deployed Quai Vault.
   * Deploys DAOShip proxy, SharesERC20 proxy, LootERC20 proxy, and vault
   * atomically using CREATE2 with the provided salts.
   *
   * The vault is created with the DAOShip pre-enabled as a module and
   * MultiSendCallOnly pre-whitelisted for DelegateCall.
   */
  async launchDAOShipAndVault(params: LaunchDAOShipAndVaultParams): Promise<LaunchResult> {
    const contract = this.getWriteContract()

    const tx = await contract.launchDAOShipAndVault(
      params.initializationParamsTemplate,
      params.shareTokenName,
      params.shareTokenSymbol,
      params.lootTokenName,
      params.lootTokenSymbol,
      params.vaultOwners,
      params.vaultThreshold,
      params.vaultSalt,
      params.sharesSalt,
      params.lootSalt,
      params.daoShipSalt,
    )

    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('launchDAOShipAndVault transaction reverted')
    }

    // Parse the LaunchDAOShipAndVault event to extract addresses
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data })
        if (parsed && parsed.name === 'LaunchDAOShipAndVault') {
          return {
            daoShipAddress: parsed.args.daoShip,
            vaultAddress: parsed.args.vault,
          }
        }
      } catch {
        // Not a matching log, skip
      }
    }

    throw new Error('launchDAOShipAndVault: could not find LaunchDAOShipAndVault event in receipt')
  }
}

export const launcherService = new LauncherService()

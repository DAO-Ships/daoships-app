// ═══════════════════════════════════════════════════════════════════════════
// SaltMiner Service
// ═══════════════════════════════════════════════════════════════════════════
//
// Orchestrates the saltMiner Web Worker to mine CREATE2 salts for all four
// contracts required by DAOShipAndVaultLauncher.launchDAOShipAndVault():
//   1. Vault  (QuaiVaultProxy via QuaiVaultFactory)
//   2. Shares (ERC1167 minimal proxy via DAOShipLauncher)
//   3. Loot   (ERC1167 minimal proxy via DAOShipLauncher)
//   4. DAOShip (ERC1167 minimal proxy via DAOShipLauncher)
//
// Salt sender addresses (critical for correct CREATE2 prediction):
//   - Vault:         DAOShipAndVaultLauncher -> QuaiVaultFactory
//                    msg.sender to QuaiVaultFactory = DAOShipAndVaultLauncher
//   - Shares/Loot/DAOShip: DAOShipAndVaultLauncher -> DAOShipLauncher
//                    msg.sender to DAOShipLauncher = DAOShipAndVaultLauncher
//
// Salt packing types (must match on-chain logic):
//   - Vault:  keccak256(abi.encodePacked(address, bytes32))  — QuaiVaultFactory
//   - Others: keccak256(abi.encodePacked(address, uint256))  — DAOShipLauncher
//
// Vault initCodeHash:
//   The vault uses QuaiVaultProxy (NOT ERC1167 minimal proxy). The initCodeHash
//   is keccak256(QuaiVaultProxy.bytecode + abi.encode([address, bytes], [implementation, initData]))
//   where initData = QuaiVault.initialize(owners, threshold, minExecutionDelay, initialModules, initialDelegatecallTargets).
//   initialModules = [predictedDaoShipAddress] (pre-enable DAOShip as vault module)
//   initialDelegatecallTargets = [multisendCallOnly] (whitelist MultiSend for DelegateCall)
//   This MUST match the QuaiVaultFactory's CREATE2 computation exactly.
//
// Two-phase mining:
//   Phase 1: Mine shares, loot, daoShip (no dependencies between them)
//   Phase 2: Mine vault (depends on predicted daoShip address for initialModules)
//
// Reference: daoships-contracts/scripts/launch-dao.ts
// ═══════════════════════════════════════════════════════════════════════════

import { CONTRACT_ADDRESSES } from '@/config/contracts'
import { quais } from 'quais'

// Import vault artifacts for correct initCodeHash computation
import QuaiVaultJson from '@/config/abi/QuaiVault.json'
import QuaiVaultProxyJson from '@/config/abi/QuaiVaultProxy.json'

// ── Types ─────────────────────────────────────────────────────────────────

export interface SaltMiningParams {
  /** Vault owner addresses (needed for vault initCodeHash computation) */
  vaultOwners: string[]
  /** Required approval threshold for the vault multisig */
  vaultThreshold: number
  /** Predicted DAOShip address (needed for vault initCodeHash — DAOShip is pre-enabled as vault module) */
  predictedDaoShipAddress?: string
}

export interface SaltResult {
  salt: string
  address: string
}

export interface SaltMiningResults {
  vault: SaltResult
  shares: SaltResult
  loot: SaltResult
  daoShip: SaltResult
}

export type ProgressCallback = (progress: {
  currentContract: string
  contractsComplete: number
  totalContracts: number
  currentAttempt: number
}) => void

// ── ERC1167 Minimal Proxy Bytecode ───────────────────────────────────────
// Used by DAOShipLauncher for Shares, Loot, and DAOShip clones.
// The singleton address is embedded at the fixed offset.

const MINIMAL_PROXY_PREFIX = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73'
const MINIMAL_PROXY_SUFFIX = '5af43d82803e903d91602b57fd5bf3'

function getMinimalProxyBytecode(singletonAddress: string): string {
  const addr = singletonAddress.toLowerCase().replace('0x', '')
  return MINIMAL_PROXY_PREFIX + addr + MINIMAL_PROXY_SUFFIX
}

// ── SaltMiner Class ──────────────────────────────────────────────────────

class SaltMiner {
  private worker: Worker | null = null

  /**
   * Compute initCodeHash for each contract type.
   *
   * - Shares/Loot/DAOShip: ERC1167 minimal proxy bytecode with their singleton
   * - Vault: QuaiVaultProxy bytecode + constructor args (implementation + initData)
   *
   * The vault computation matches the reference implementation in
   * daoships-contracts/scripts/launch-dao.ts (mineVaultSalt function).
   */
  private getInitCodeHash(
    contractType: 'vault' | 'shares' | 'loot' | 'daoShip',
    params?: SaltMiningParams
  ): string {
    switch (contractType) {
      case 'shares': {
        const bytecode = getMinimalProxyBytecode(CONTRACT_ADDRESSES.SHARES_SINGLETON)
        return quais.keccak256(bytecode)
      }
      case 'loot': {
        const bytecode = getMinimalProxyBytecode(CONTRACT_ADDRESSES.LOOT_SINGLETON)
        return quais.keccak256(bytecode)
      }
      case 'daoShip': {
        const bytecode = getMinimalProxyBytecode(CONTRACT_ADDRESSES.DAOSHIP_SINGLETON)
        return quais.keccak256(bytecode)
      }
      case 'vault': {
        if (!params) {
          throw new Error('Vault initCodeHash requires SaltMiningParams (vaultOwners, vaultThreshold)')
        }

        const implementation = CONTRACT_ADDRESSES.VAULT_SINGLETON
        if (!implementation) {
          throw new Error('VITE_VAULT_SINGLETON must be set for vault salt mining')
        }

        // Encode QuaiVault.initialize(owners, threshold, minExecutionDelay, initialModules, initialDelegatecallTargets)
        // The 5-param initialize matches the QuaiVaultFactory.createWallet 6-param overload
        const vaultIface = new quais.Interface(QuaiVaultJson.abi)
        const predictedDaoShip = params.predictedDaoShipAddress || '0x0000000000000000000000000000000000000000'
        const multisendCallOnly = CONTRACT_ADDRESSES.MULTISEND_CALL_ONLY
        const initData = vaultIface.encodeFunctionData('initialize', [
          params.vaultOwners,
          params.vaultThreshold,
          0,                              // minExecutionDelay
          [predictedDaoShip],             // initialModules: pre-enable DAOShip
          [multisendCallOnly],            // initialDelegatecallTargets: whitelist MultiSend
        ])

        // Encode constructor args: QuaiVaultProxy(address implementation, bytes data)
        const encodedArgs = quais.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes'],
          [implementation, initData]
        )

        // Full init code = QuaiVaultProxy bytecode + constructor args
        const fullBytecode = QuaiVaultProxyJson.bytecode + encodedArgs.slice(2)
        return quais.keccak256(fullBytecode)
      }
    }
  }

  /**
   * Mine CREATE2 salts for all four contracts.
   *
   * Returns salts that produce Cyprus1-valid addresses (starting with 0x00)
   * for each contract when deployed through DAOShipAndVaultLauncher.
   */
  async mineAllSalts(
    params: SaltMiningParams,
    onProgress?: ProgressCallback
  ): Promise<SaltMiningResults> {
    return new Promise((resolve, reject) => {
      // Create worker using Vite's Web Worker import syntax
      this.worker = new Worker(
        new URL('../../workers/saltMiner.worker.ts', import.meta.url),
        { type: 'module' }
      )

      const results: Partial<SaltMiningResults> = {}
      let contractsComplete = 0
      let phase = 1 // 1 = mining clones, 2 = mining vault

      this.worker.onmessage = (event) => {
        const msg = event.data

        if (msg.type === 'progress') {
          onProgress?.({
            currentContract: msg.contract,
            contractsComplete,
            totalContracts: 4,
            currentAttempt: msg.attempt,
          })
        }

        if (msg.type === 'result') {
          results[msg.contract as keyof SaltMiningResults] = {
            salt: msg.salt,
            address: msg.address,
          }
          contractsComplete++
          onProgress?.({
            currentContract: msg.contract,
            contractsComplete,
            totalContracts: 4,
            currentAttempt: 0,
          })
        }

        if (msg.type === 'complete') {
          if (phase === 1) {
            // Phase 1 done (shares, loot, daoShip). Start phase 2: mine vault.
            // Now we know the predicted DAOShip address, which is needed for the vault initCodeHash.
            phase = 2
            const predictedDaoShip = results.daoShip?.address
            if (!predictedDaoShip) {
              this.cleanup()
              reject(new Error('DAOShip address not available after phase 1 mining'))
              return
            }

            const vaultParams: SaltMiningParams = {
              ...params,
              predictedDaoShipAddress: predictedDaoShip,
            }

            this.worker!.postMessage({
              type: 'mine',
              contracts: [
                {
                  name: 'vault',
                  factoryAddress: CONTRACT_ADDRESSES.QUAIVAULT_FACTORY,
                  senderAddress: CONTRACT_ADDRESSES.DAOSHIP_AND_VAULT_LAUNCHER,
                  initCodeHash: this.getInitCodeHash('vault', vaultParams),
                  saltPackingType: 'bytes32',
                },
              ],
            })
          } else {
            // Phase 2 done (vault). All 4 contracts mined.
            this.cleanup()
            resolve(results as SaltMiningResults)
          }
        }

        if (msg.type === 'error') {
          this.cleanup()
          reject(new Error(msg.message))
        }
      }

      this.worker.onerror = (err) => {
        this.cleanup()
        reject(new Error(err.message))
      }

      // Two-phase mining:
      // Phase 1: Mine shares, loot, daoShip (their initCodeHash doesn't depend on each other)
      // Phase 2: Mine vault (its initCodeHash includes the predicted DAOShip address as initialModule)
      //
      // The sender for all contracts is DAOShipAndVaultLauncher.
      const senderAddress = CONTRACT_ADDRESSES.DAOSHIP_AND_VAULT_LAUNCHER

      // Phase 1: Mine token clones + DAOShip
      this.worker.postMessage({
        type: 'mine',
        contracts: [
          {
            name: 'shares',
            factoryAddress: CONTRACT_ADDRESSES.DAOSHIP_LAUNCHER,
            senderAddress,
            initCodeHash: this.getInitCodeHash('shares'),
            saltPackingType: 'uint256',
          },
          {
            name: 'loot',
            factoryAddress: CONTRACT_ADDRESSES.DAOSHIP_LAUNCHER,
            senderAddress,
            initCodeHash: this.getInitCodeHash('loot'),
            saltPackingType: 'uint256',
          },
          {
            name: 'daoShip',
            factoryAddress: CONTRACT_ADDRESSES.DAOSHIP_LAUNCHER,
            senderAddress,
            initCodeHash: this.getInitCodeHash('daoShip'),
            saltPackingType: 'uint256',
          },
        ],
      })

      // When phase 1 completes (3 contracts done), start phase 2 (vault)
      // The worker sends 'complete' when all contracts in a batch are done
      // We intercept it to start phase 2 instead of resolving
    })
  }

  /**
   * Cancel an in-progress mining operation.
   * Sends a cancel message to the worker and terminates it after a short delay.
   */
  cancel(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'cancel' })
      setTimeout(() => this.cleanup(), 100)
    }
  }

  /**
   * Terminate the worker and release resources.
   */
  private cleanup(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}

export const saltMiner = new SaltMiner()

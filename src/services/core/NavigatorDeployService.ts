import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import OnboarderNavigatorABI from '@/config/abi/OnboarderNavigator.json'
import ERC20TributeNavigatorABI from '@/config/abi/ERC20TributeNavigator.json'
import { ONBOARDER_NAVIGATOR_BYTECODE } from '@/config/abi/OnboarderNavigator.bytecode'
import { ERC20_TRIBUTE_NAVIGATOR_BYTECODE } from '@/config/abi/ERC20TributeNavigator.bytecode'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorDeployService - Deploy navigator contracts via ContractFactory
// ═══════════════════════════════════════════════════════════════════════════

const ZERO_BYTES32 = '0x' + '00'.repeat(32)

// IPFS CIDs extracted from compiled bytecode CBOR metadata appendix.
// quais ContractFactory requires a valid 46-char IPFS CIDv0 for on-chain source verification.
const ONBOARDER_IPFS_HASH = 'QmWycQqiFSuoXzQaHo7fgyxJ8o15nVCussfTTeEDjUWQWr'
const ERC20_TRIBUTE_IPFS_HASH = 'QmUfM1rTQvbsMJrLw6ACsrPD4mZNA4prCun6enPXb9wymW'

export interface OnboarderDeployParams {
  daoShipAddress: string
  mode: 'multiplier' | 'fixedPrice'
  // Multiplier mode (basis points: 10000 = 1x)
  shareMultiplier: bigint
  lootMultiplier: bigint
  // Fixed-price mode
  pricePerUnit: bigint
  sharesPerUnit: bigint
  lootPerUnit: bigint
  // Common
  minTribute: bigint
  expiry: bigint          // 0 = no expiry
  mintCap: bigint         // 0 = unlimited
  perAddressCap: bigint   // 0 = unlimited
  allowlistRoot?: string  // bytes32, default = open (no allowlist)
}

export interface ERC20TributeDeployParams {
  daoShipAddress: string
  tributeToken: string
  pricePerShare: bigint
  pricePerLoot: bigint
  expiry: bigint
  mintCap: bigint
  perAddressCap: bigint
  allowlistRoot?: string
}

/**
 * Deploys navigator contracts using quais.ContractFactory.
 * Navigators are immutable once deployed — all config is set in the constructor.
 */
class NavigatorDeployService {

  /**
   * Deploy an OnboarderNavigator.
   *
   * Constructor: (daoShip, shareMultiplier, lootMultiplier, pricePerUnit,
   *   sharesPerUnit, lootPerUnit, minTribute, expiry, mintCap, perAddressCap, allowlistRoot)
   *
   * @returns Deployed contract address
   */
  async deployOnboarderNavigator(params: OnboarderDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      OnboarderNavigatorABI,
      ONBOARDER_NAVIGATOR_BYTECODE,
      signer,
      ONBOARDER_IPFS_HASH,
    )

    // Enforce mode exclusivity
    let shareMultiplier = params.shareMultiplier
    let lootMultiplier = params.lootMultiplier
    let pricePerUnit = params.pricePerUnit
    let sharesPerUnit = params.sharesPerUnit
    let lootPerUnit = params.lootPerUnit

    if (params.mode === 'multiplier') {
      pricePerUnit = 0n
      sharesPerUnit = 0n
      lootPerUnit = 0n
    } else {
      shareMultiplier = 0n
      lootMultiplier = 0n
    }

    const contract = await factory.deploy(
      params.daoShipAddress,
      shareMultiplier,
      lootMultiplier,
      pricePerUnit,
      sharesPerUnit,
      lootPerUnit,
      params.minTribute,
      params.expiry,
      params.mintCap,
      params.perAddressCap,
      params.allowlistRoot || ZERO_BYTES32,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification
    const deployed = new quais.Contract(address, OnboarderNavigatorABI, baseService.getProvider())
    const navType = await deployed.navigatorType()
    if (navType !== 'OnboarderNavigator') {
      throw new Error(`Deployed contract is not an OnboarderNavigator (got type: ${navType})`)
    }
    const daoShipOnChain = await deployed.daoShip()
    if (daoShipOnChain.toLowerCase() !== params.daoShipAddress.toLowerCase()) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Deploy an ERC20TributeNavigator.
   *
   * Constructor: (daoShip, tributeToken, pricePerShare, pricePerLoot,
   *   expiry, mintCap, perAddressCap, allowlistRoot)
   *
   * @returns Deployed contract address
   */
  async deployERC20TributeNavigator(params: ERC20TributeDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      ERC20TributeNavigatorABI,
      ERC20_TRIBUTE_NAVIGATOR_BYTECODE,
      signer,
      ERC20_TRIBUTE_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.tributeToken,
      params.pricePerShare,
      params.pricePerLoot,
      params.expiry,
      params.mintCap,
      params.perAddressCap,
      params.allowlistRoot || ZERO_BYTES32,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification
    const deployed = new quais.Contract(address, ERC20TributeNavigatorABI, baseService.getProvider())
    const navType = await deployed.navigatorType()
    if (navType !== 'ERC20TributeNavigator') {
      throw new Error(`Deployed contract is not an ERC20TributeNavigator (got type: ${navType})`)
    }

    return address
  }
}

export const navigatorDeployService = new NavigatorDeployService()

import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import OnboarderNavigatorABI from '@/config/abi/OnboarderNavigator.json'
import ERC20TributeNavigatorABI from '@/config/abi/ERC20TributeNavigator.json'
import NFTGatedNavigatorABI from '@/config/abi/NFTGatedNavigator.json'
import SignalNavigatorABI from '@/config/abi/SignalNavigator.json'
import VestingNavigatorABI from '@/config/abi/VestingNavigator.json'
import TimelockNavigatorABI from '@/config/abi/TimelockNavigator.json'
import SubscriptionNavigatorABI from '@/config/abi/SubscriptionNavigator.json'
import BudgetNavigatorABI from '@/config/abi/BudgetNavigator.json'
import { ONBOARDER_NAVIGATOR_BYTECODE } from '@/config/abi/OnboarderNavigator.bytecode'
import { ERC20_TRIBUTE_NAVIGATOR_BYTECODE } from '@/config/abi/ERC20TributeNavigator.bytecode'
import { NFT_GATED_NAVIGATOR_BYTECODE } from '@/config/abi/NFTGatedNavigator.bytecode'
import { SIGNAL_NAVIGATOR_BYTECODE } from '@/config/abi/SignalNavigator.bytecode'
import { VESTING_NAVIGATOR_BYTECODE } from '@/config/abi/VestingNavigator.bytecode'
import { TIMELOCK_NAVIGATOR_BYTECODE } from '@/config/abi/TimelockNavigator.bytecode'
import { SUBSCRIPTION_NAVIGATOR_BYTECODE } from '@/config/abi/SubscriptionNavigator.bytecode'
import { BUDGET_NAVIGATOR_BYTECODE } from '@/config/abi/BudgetNavigator.bytecode'
import { addressesEqual } from '../utils/AddressUtils'
import { assertAffordable, estimateTxGas, modelDeployGas } from '../utils/LaunchGasEstimator'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorDeployService - Deploy navigator contracts via ContractFactory
// ═══════════════════════════════════════════════════════════════════════════

const ZERO_BYTES32 = '0x' + '00'.repeat(32)

// IPFS CIDs extracted from compiled bytecode CBOR metadata appendix.
// quais ContractFactory requires a valid 46-char IPFS CIDv0 for on-chain source verification.
const ONBOARDER_IPFS_HASH = 'QmeFR5wgHwGL91BAUQoQrdfhmFGCagQKoUzBEsYRMCkgdn'
const ERC20_TRIBUTE_IPFS_HASH = 'QmNkqVRbHfJVnEfa36XDRYV8xrPpJmsBJDm2XuyY2ufFJN'
const NFT_GATED_IPFS_HASH = 'Qmavg3RjwCjRCEHUHRayeg4gj2UoiB9t1uKEUbsL5qb5md'
const SIGNAL_IPFS_HASH = 'QmQTefaaDcNXkZjjXGdt9czkZEjxZGjqvHuY95h1bHvJLF'
// Extracted from the VestingNavigator creation bytecode's CBOR metadata appendix
// (must match VESTING_NAVIGATOR_BYTECODE — both copied from the same artifact).
const VESTING_IPFS_HASH = 'QmdSX6vuYL2vcmsAEXAm9rT1nwjBivxwU8iwHeURHSPvgi'
// Extracted from the TimelockNavigator creation bytecode's CBOR metadata appendix
// (must match TIMELOCK_NAVIGATOR_BYTECODE — both copied from the same artifact).
const TIMELOCK_IPFS_HASH = 'QmRHkRsWTPGDoeP6XKL9RuXMkBfWdboQDPuYBm4NRvh8qn'
// Extracted from the SubscriptionNavigator creation bytecode's CBOR metadata appendix
// (must match SUBSCRIPTION_NAVIGATOR_BYTECODE — both copied from the same artifact).
const SUBSCRIPTION_IPFS_HASH = 'QmPYtpmxAbU6WrYNz1h8V7ikQSDoaE7QDKRjMsbdzULZMa'
// Extracted from the BudgetNavigator creation bytecode's CBOR metadata appendix
// (must match BUDGET_NAVIGATOR_BYTECODE — both copied from the same artifact).
const BUDGET_IPFS_HASH = 'QmaWqpzw5A8bGYxGUhmCir34iLc1aeZWeiTZrYBgCrUNue'

// ERC-165 interface id for IERC721 — used for a best-effort gate-token sanity probe.
const ERC721_INTERFACE_ID = '0x80ac58cd'

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
  name: string            // Human-readable name (emitted in NavigatorDeployed event)
  description: string     // Human-readable description
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
  name: string
  description: string
}

export interface SignalNavigatorDeployParams {
  daoShipAddress: string
  minSharesToCreatePoll: bigint  // min voting power (wei) to open a poll; 0 = anyone with any power
  minDuration: bigint            // seconds, > 0
  maxDuration: bigint            // seconds, >= minDuration and <= MAX_WINDOW (3650 days)
  maxStartDelay: bigint          // seconds, <= MAX_WINDOW; 0 = immediate-only (no scheduling)
  name: string
  description: string
}

export interface VestingNavigatorDeployParams {
  daoShipAddress: string
  name: string
  description: string
}

export interface BudgetNavigatorDeployParams {
  daoShipAddress: string
  name: string
  description: string
}

export interface TimelockNavigatorDeployParams {
  daoShipAddress: string
  delay: bigint         // seconds; MIN_DELAY (10m) .. MAX_DELAY (30d)
  expiryWindow: bigint  // seconds; MIN_EXPIRY (1h) .. MAX_EXPIRY (3650d)
  name: string
  description: string
}

export interface SubscriptionNavigatorDeployParams {
  daoShipAddress: string
  tokens: string[]           // accepted fee tokens; ZeroAddress = native QUAI (no dupes)
  feesPerPeriod: bigint[]    // 1:1 with tokens; fee per period in each token's unit
  periodDuration: bigint     // seconds; MIN_PERIOD (1d) .. MAX_PERIOD (~3y)
  graceDuration: bigint      // seconds
  startTime: bigint          // unix seconds (0 = now, per contract)
  collectorRewardBps: bigint // keeper reward, 0 .. MAX_COLLECTOR_BPS (10000)
  burnOnCollect: boolean     // true = burn shares, false = convert to loot
  initialMembers: string[]   // enrolled for one complimentary period at deploy
  name: string
  description: string
}

export interface NFTGatedDeployParams {
  daoShipAddress: string
  gateToken: string            // ERC-721 collection (must be a deployed contract)
  sharesPerHolder: bigint      // raw wei; at least one of shares/loot > 0
  lootPerHolder: bigint
  requireTribute: boolean
  tributeAmount: bigint        // wei; must be 0 iff requireTribute === false
  expiry: bigint               // 0 = no expiry
  mintCap: bigint              // MANDATORY, > 0; >= sharesPerHolder + lootPerHolder
  perAddressCap: bigint        // 0 = unlimited; else >= sharesPerHolder + lootPerHolder
  allowlistRoot?: string       // bytes32, default = open (no allowlist)
  name: string
  description: string
}

/**
 * Deploys navigator contracts using quais.ContractFactory.
 * Navigators are immutable once deployed — all config is set in the constructor.
 */
class NavigatorDeployService {

  /**
   * Block a deploy the wallet cannot pay for, before it reaches the wallet.
   *
   * During a DAO launch the navigators are deployed ahead of the DAO itself, so
   * running out of QUAI midway leaves orphaned navigators pointing at a DAO that
   * was never created. Estimating first turns that into a clear, retryable error.
   *
   * Falls back to the modeled deploy gas when the wallet's RPC bridge refuses to
   * simulate contract creations, and skips entirely when gas price or balance
   * cannot be read — this never blocks on an unknown.
   */
  private async preflightDeploy(
    factory: quais.ContractFactory,
    args: unknown[],
    label: string,
  ): Promise<void> {
    let gas: bigint | null = null
    try {
      const from = await baseService.requireSigner().getAddress()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ContractFactory args are constructor-shaped and untyped here
      const deployTx = await factory.getDeployTransaction(...(args as any[]))
      gas = await estimateTxGas({ ...deployTx, from }, label)
    } catch (err) {
      console.warn(`[NavigatorDeployService] Could not prepare "${label}" for estimation:`, err)
    }
    await assertAffordable(gas ?? modelDeployGas(factory.bytecode), label)
  }

  /**
   * Deploy an OnboarderNavigator.
   *
   * Constructor: (daoShip, shareMultiplier, lootMultiplier, pricePerUnit,
   *   sharesPerUnit, lootPerUnit, minTribute, expiry, mintCap, perAddressCap, allowlistRoot, name, description)
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

    const deployArgs = [
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
      params.name,
      params.description,
    ]

    await this.preflightDeploy(factory, deployArgs, 'Deploy Onboarder Navigator')

    const contract = await factory.deploy(...deployArgs)

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification
    const deployed = new quais.Contract(address, OnboarderNavigatorABI, baseService.getProvider())
    const navType = await deployed.navigatorType()
    if (navType !== 'OnboarderNavigator') {
      throw new Error(`Deployed contract is not an OnboarderNavigator (got type: ${navType})`)
    }
    const daoShipOnChain = await deployed.daoShip()
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Deploy an ERC20TributeNavigator.
   *
   * Constructor: (daoShip, tributeToken, pricePerShare, pricePerLoot,
   *   expiry, mintCap, perAddressCap, allowlistRoot, name, description)
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

    const deployArgs = [
      params.daoShipAddress,
      params.tributeToken,
      params.pricePerShare,
      params.pricePerLoot,
      params.expiry,
      params.mintCap,
      params.perAddressCap,
      params.allowlistRoot || ZERO_BYTES32,
      params.name,
      params.description,
    ]

    await this.preflightDeploy(factory, deployArgs, 'Deploy ERC-20 Tribute Navigator')

    const contract = await factory.deploy(...deployArgs)

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

  /**
   * Deploy a SignalNavigator (read-only, non-binding polls).
   *
   * Constructor: (daoShip, minSharesToCreatePoll, minDuration, maxDuration, maxStartDelay, name, description)
   *
   * Holds NO permission and is NOT registered via setNavigators — it never calls the DAOShip.
   * The indexer discovers it from NavigatorDeployed (trust_status = 'self_asserted'); its polls
   * do not materialize until the DAO sanctions it via a `daoships.dao.navigators` governance post.
   *
   * @returns Deployed contract address
   */
  async deploySignalNavigator(params: SignalNavigatorDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      SignalNavigatorABI,
      SIGNAL_NAVIGATOR_BYTECODE,
      signer,
      SIGNAL_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.minSharesToCreatePoll,
      params.minDuration,
      params.maxDuration,
      params.maxStartDelay,
      params.name,
      params.description,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification: type + DAO binding.
    const deployed = new quais.Contract(address, SignalNavigatorABI, baseService.getProvider())
    const [navType, daoShipOnChain] = await Promise.all([
      deployed.navigatorType(),
      deployed.daoShip(),
    ])
    if (navType !== 'SignalNavigator') {
      throw new Error(`Deployed contract is not a SignalNavigator (got type: ${navType})`)
    }
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Deploy a VestingNavigator (MANAGER — mints shares/loot on a cliff + linear schedule).
   *
   * Constructor: (daoShip, name, description)
   *
   * The constructor only stores `daoShip` and emits NavigatorDeployed — it makes no call
   * to the DAO, so it is safe to deploy against a predicted DAO address. After deploy it
   * must be registered as MANAGER (`setNavigators([nav],[2])`) before any claim can mint.
   *
   * @returns Deployed contract address
   */
  async deployVestingNavigator(params: VestingNavigatorDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      VestingNavigatorABI,
      VESTING_NAVIGATOR_BYTECODE,
      signer,
      VESTING_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.name,
      params.description,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification: type + DAO binding.
    const deployed = new quais.Contract(address, VestingNavigatorABI, baseService.getProvider())
    const [navType, daoShipOnChain] = await Promise.all([
      deployed.navigatorType(),
      deployed.daoShip(),
    ])
    if (navType !== 'VestingNavigator') {
      throw new Error(`Deployed contract is not a VestingNavigator (got type: ${navType})`)
    }
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Deploy a BudgetNavigator (treasury-disbursement vault module — no DAOShip permission).
   *
   * Constructor: (daoShip, name, description). The constructor only stores daoShip and emits
   * NavigatorDeployed — it makes NO call to the DAO, so it is safe to deploy against a predicted
   * DAO address. It never mints, so there are no caps/allowlist/expiry to configure here.
   *
   * After deploy it must be enabled as a Zodiac module ON THE VAULT (avatar) via a governance
   * proposal calling `vault.enableModule(navigator)` — NOT setNavigators on the DAOShip. Budgets
   * (manager, allowance, ceiling, period) are then created by further governance proposals.
   *
   * @returns Deployed contract address
   */
  async deployBudgetNavigator(params: BudgetNavigatorDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      BudgetNavigatorABI,
      BUDGET_NAVIGATOR_BYTECODE,
      signer,
      BUDGET_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.name,
      params.description,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification: type + DAO binding.
    const deployed = new quais.Contract(address, BudgetNavigatorABI, baseService.getProvider())
    const [navType, daoShipOnChain] = await Promise.all([
      deployed.navigatorType(),
      deployed.daoShip(),
    ])
    if (navType !== 'BudgetNavigator') {
      throw new Error(`Deployed contract is not a BudgetNavigator (got type: ${navType})`)
    }
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Deploy a TimelockNavigator (GOVERNOR — delays governance-config changes).
   *
   * Constructor: (daoShip, delay, expiryWindow, name, description)
   *
   * The constructor makes no call to the DAO (safe against a predicted address). After
   * deploy it must be registered as GOVERNOR (`setNavigators([nav],[4])`) — and ideally be
   * the ONLY GOVERNOR navigator — for the "config changes go through the timelock" guarantee.
   *
   * @returns Deployed contract address
   */
  async deployTimelockNavigator(params: TimelockNavigatorDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      TimelockNavigatorABI,
      TIMELOCK_NAVIGATOR_BYTECODE,
      signer,
      TIMELOCK_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.delay,
      params.expiryWindow,
      params.name,
      params.description,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification: type + DAO binding.
    const deployed = new quais.Contract(address, TimelockNavigatorABI, baseService.getProvider())
    const [navType, daoShipOnChain] = await Promise.all([
      deployed.navigatorType(),
      deployed.daoShip(),
    ])
    if (navType !== 'TimelockNavigator') {
      throw new Error(`Deployed contract is not a TimelockNavigator (got type: ${navType})`)
    }
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Deploy a SubscriptionNavigator (MANAGER — recurring membership dues).
   *
   * Constructor: (daoShip, tokens[], feesPerPeriod[], periodDuration, graceDuration,
   *   startTime, collectorRewardBps, burnOnCollect, initialMembers[], name, description)
   *
   * Makes no call to the DAO (safe against a predicted address). Register as MANAGER (2)
   * after deploy before any dues/collection can touch the cap table.
   *
   * @returns Deployed contract address
   */
  async deploySubscriptionNavigator(params: SubscriptionNavigatorDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      SubscriptionNavigatorABI,
      SUBSCRIPTION_NAVIGATOR_BYTECODE,
      signer,
      SUBSCRIPTION_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.tokens,
      params.feesPerPeriod,
      params.periodDuration,
      params.graceDuration,
      params.startTime,
      params.collectorRewardBps,
      params.burnOnCollect,
      params.initialMembers,
      params.name,
      params.description,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification: type + DAO binding.
    const deployed = new quais.Contract(address, SubscriptionNavigatorABI, baseService.getProvider())
    const [navType, daoShipOnChain] = await Promise.all([
      deployed.navigatorType(),
      deployed.daoShip(),
    ])
    if (navType !== 'SubscriptionNavigator') {
      throw new Error(`Deployed contract is not a SubscriptionNavigator (got type: ${navType})`)
    }
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }

    return address
  }

  /**
   * Best-effort sanity probe of a prospective gate token (run before deploy so the
   * creator gets a warning instead of a confusing InvalidConfig revert). Returns:
   * - 'erc721'    : implements ERC-165 IERC721 — confirmed good gate
   * - 'contract'  : responds to an ERC-721 view but doesn't advertise ERC-165 — likely OK
   * - 'unknown'   : no usable response (EOA, wrong network, or hostile) — likely bad
   *
   * Never throws. The contract constructor remains the authoritative backstop
   * (it reverts InvalidConfig if the gate has no code).
   */
  async probeGateToken(gateToken: string): Promise<'erc721' | 'contract' | 'unknown'> {
    if (!baseService.hasProvider()) return 'unknown'
    let checksummed: string
    try {
      checksummed = quais.getAddress(gateToken)
    } catch {
      return 'unknown'
    }
    const gate = new quais.Contract(
      checksummed,
      [
        'function supportsInterface(bytes4) view returns (bool)',
        'function balanceOf(address) view returns (uint256)',
      ],
      baseService.getProvider(),
    )
    try {
      if (await gate.supportsInterface(ERC721_INTERFACE_ID)) return 'erc721'
    } catch {
      // No ERC-165 — fall through to a softer probe.
    }
    try {
      // A real ERC-721 returns a uint for balanceOf; an EOA / non-contract reverts.
      await gate.balanceOf(checksummed)
      return 'contract'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Deploy an NFTGatedNavigator.
   *
   * Constructor: (daoShip, gateToken, sharesPerHolder, lootPerHolder, requireTribute,
   *   tributeAmount, expiry, mintCap, perAddressCap, allowlistRoot, name, description)
   *
   * @returns Deployed contract address
   */
  async deployNFTGatedNavigator(params: NFTGatedDeployParams): Promise<string> {
    const signer = baseService.requireSigner()
    const factory = new quais.ContractFactory(
      NFTGatedNavigatorABI,
      NFT_GATED_NAVIGATOR_BYTECODE,
      signer,
      NFT_GATED_IPFS_HASH,
    )

    const contract = await factory.deploy(
      params.daoShipAddress,
      params.gateToken,
      params.sharesPerHolder,
      params.lootPerHolder,
      params.requireTribute,
      params.tributeAmount,
      params.expiry,
      params.mintCap,
      params.perAddressCap,
      params.allowlistRoot || ZERO_BYTES32,
      params.name,
      params.description,
    )

    await contract.waitForDeployment()
    const address = await contract.getAddress()

    // Post-deployment verification: type, DAO binding, and the security-critical gate address.
    const deployed = new quais.Contract(address, NFTGatedNavigatorABI, baseService.getProvider())
    const [navType, daoShipOnChain, gateOnChain] = await Promise.all([
      deployed.navigatorType(),
      deployed.daoShip(),
      deployed.gateToken(),
    ])
    if (navType !== 'NFTGatedNavigator') {
      throw new Error(`Deployed contract is not an NFTGatedNavigator (got type: ${navType})`)
    }
    if (!addressesEqual(daoShipOnChain, params.daoShipAddress)) {
      throw new Error(`Navigator daoShip mismatch: expected ${params.daoShipAddress}, got ${daoShipOnChain}`)
    }
    if (!addressesEqual(gateOnChain, params.gateToken)) {
      throw new Error(`Navigator gateToken mismatch: expected ${params.gateToken}, got ${gateOnChain}`)
    }

    return address
  }
}

export const navigatorDeployService = new NavigatorDeployService()

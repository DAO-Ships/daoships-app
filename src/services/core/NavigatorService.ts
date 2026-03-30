import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import OnboarderNavigatorABI from '@/config/abi/OnboarderNavigator.json'
import ERC20TributeNavigatorABI from '@/config/abi/ERC20TributeNavigator.json'
import SharesERC20ABI from '@/config/abi/SharesERC20.json'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorService - Navigator contract interactions
// ═══════════════════════════════════════════════════════════════════════════

// ─── Type discriminator ──────────────────────────────────────────────────

export type NavigatorType = 'OnboarderNavigator' | 'ERC20TributeNavigator' | 'unknown'

export type NavigatorConfigResult =
  | { type: 'OnboarderNavigator'; config: OnboarderNavigatorConfig }
  | { type: 'ERC20TributeNavigator'; config: ERC20TributeNavigatorConfig }
  | { type: 'unknown'; config: null }

// ─── OnboarderNavigator config ───────────────────────────────────────────

export interface OnboarderNavigatorConfig {
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
  expiry: bigint
  mintCap: bigint
  perAddressCap: bigint
  allowlistRoot: string
  totalMinted: bigint
  paused: boolean
  navigatorType: string
}

// ─── ERC20TributeNavigator config ────────────────────────────────────────

export interface ERC20TributeNavigatorConfig {
  tributeToken: string
  tributeTokenSymbol: string
  tributeTokenDecimals: number
  pricePerShare: bigint
  pricePerLoot: bigint
  expiry: bigint
  mintCap: bigint
  perAddressCap: bigint
  allowlistRoot: string
  totalMinted: bigint
  paused: boolean
  navigatorType: string
}

// ─── ERC20 minimal interface for approve/allowance/permit ───────────────

const ERC20_MINIMAL_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]

const ERC20_PERMIT_PROBE_ABI = [
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]


/**
 * Service for interacting with navigator contracts.
 *
 * Shipped navigators:
 * - OnboarderNavigator (MANAGER=2): Native QUAI tribute → shares/loot
 * - ERC20TributeNavigator (MANAGER=2): ERC20 token tribute → shares/loot
 */
class NavigatorService {

  // ═══════════════════════════════════════════════════════════════════════
  // Type Detection (canonical: reads navigatorType() constant)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Detect navigator type by reading the on-chain `navigatorType()` constant,
   * then load the type-specific config.
   */
  async detectAndLoadConfig(navigatorAddress: string): Promise<NavigatorConfigResult> {
    try {
      // Both navigator ABIs expose navigatorType() — use OnboarderNavigator ABI as a generic reader
      const contract = new quais.Contract(
        navigatorAddress,
        OnboarderNavigatorABI,
        baseService.getProvider(),
      )
      const typeString: string = await contract.navigatorType()

      switch (typeString) {
        case 'OnboarderNavigator': {
          const config = await this.getOnboarderConfig(navigatorAddress)
          return { type: 'OnboarderNavigator', config }
        }
        case 'ERC20TributeNavigator': {
          const config = await this.getERC20TributeConfig(navigatorAddress)
          return { type: 'ERC20TributeNavigator', config }
        }
        default:
          return { type: 'unknown', config: null }
      }
    } catch {
      return { type: 'unknown', config: null }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OnboarderNavigator
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read the full OnboarderNavigator configuration.
   */
  async getOnboarderConfig(navigatorAddress: string): Promise<OnboarderNavigatorConfig> {
    const contract = new quais.Contract(
      navigatorAddress,
      OnboarderNavigatorABI,
      baseService.getProvider(),
    )

    const [
      shareMultiplier, lootMultiplier, pricePerUnit, sharesPerUnit, lootPerUnit,
      minTribute, expiry, mintCap, perAddressCap, allowlistRoot,
      totalMinted, paused, navigatorType,
    ] = await Promise.all([
      contract.shareMultiplier(),
      contract.lootMultiplier(),
      contract.pricePerUnit(),
      contract.sharesPerUnit(),
      contract.lootPerUnit(),
      contract.minTribute(),
      contract.expiry(),
      contract.mintCap(),
      contract.perAddressCap(),
      contract.allowlistRoot(),
      contract.totalMinted(),
      contract.paused(),
      contract.navigatorType(),
    ])

    const sm = BigInt(shareMultiplier)
    const lm = BigInt(lootMultiplier)
    const ppu = BigInt(pricePerUnit)
    const mode = ppu > 0n ? 'fixedPrice' as const : 'multiplier' as const

    return {
      mode,
      shareMultiplier: sm,
      lootMultiplier: lm,
      pricePerUnit: ppu,
      sharesPerUnit: BigInt(sharesPerUnit),
      lootPerUnit: BigInt(lootPerUnit),
      minTribute: BigInt(minTribute),
      expiry: BigInt(expiry),
      mintCap: BigInt(mintCap),
      perAddressCap: BigInt(perAddressCap),
      allowlistRoot: String(allowlistRoot),
      totalMinted: BigInt(totalMinted),
      paused: Boolean(paused),
      navigatorType: String(navigatorType),
    }
  }

  /**
   * Get amount minted to a specific address (for perAddressCap display).
   */
  async getOnboarderMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    const contract = new quais.Contract(
      navigatorAddress,
      OnboarderNavigatorABI,
      baseService.getProvider(),
    )
    return BigInt(await contract.mintedTo(userAddress))
  }

  /**
   * Onboard via OnboarderNavigator. Payable — sends native QUAI.
   * @param proof Merkle proof (empty array if no allowlist)
   */
  async onboarderOnboard(navigatorAddress: string, value: bigint, proof: string[] = []): Promise<void> {
    const contract = new quais.Contract(
      navigatorAddress,
      OnboarderNavigatorABI,
      baseService.requireSigner(),
    )
    const tx = await contract['onboard(bytes32[])'](proof, { value })
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('OnboarderNavigator.onboard transaction reverted')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ERC20TributeNavigator
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read the full ERC20TributeNavigator configuration.
   * Also reads the tribute token's symbol and decimals.
   */
  async getERC20TributeConfig(navigatorAddress: string): Promise<ERC20TributeNavigatorConfig> {
    const contract = new quais.Contract(
      navigatorAddress,
      ERC20TributeNavigatorABI,
      baseService.getProvider(),
    )

    const [
      tributeToken, pricePerShare, pricePerLoot,
      expiry, mintCap, perAddressCap, allowlistRoot,
      totalMinted, paused, navigatorType,
    ] = await Promise.all([
      contract.tributeToken(),
      contract.pricePerShare(),
      contract.pricePerLoot(),
      contract.expiry(),
      contract.mintCap(),
      contract.perAddressCap(),
      contract.allowlistRoot(),
      contract.totalMinted(),
      contract.paused(),
      contract.navigatorType(),
    ])

    // Read token metadata
    let tributeTokenSymbol = 'TOKEN'
    let tributeTokenDecimals = 18
    try {
      const token = new quais.Contract(tributeToken, ERC20_MINIMAL_ABI, baseService.getProvider())
      const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
      ])
      tributeTokenSymbol = symbol
      tributeTokenDecimals = Number(decimals)
    } catch {
      // Token metadata read failed — use defaults
    }

    return {
      tributeToken: String(tributeToken),
      tributeTokenSymbol,
      tributeTokenDecimals,
      pricePerShare: BigInt(pricePerShare),
      pricePerLoot: BigInt(pricePerLoot),
      expiry: BigInt(expiry),
      mintCap: BigInt(mintCap),
      perAddressCap: BigInt(perAddressCap),
      allowlistRoot: String(allowlistRoot),
      totalMinted: BigInt(totalMinted),
      paused: Boolean(paused),
      navigatorType: String(navigatorType),
    }
  }

  /**
   * Get amount minted to a specific address.
   */
  async getERC20TributeMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    const contract = new quais.Contract(
      navigatorAddress,
      ERC20TributeNavigatorABI,
      baseService.getProvider(),
    )
    return BigInt(await contract.mintedTo(userAddress))
  }

  /**
   * Onboard via ERC20TributeNavigator.
   *
   * Flow:
   * 1. Calculate tribute cost
   * 2. Approve ERC20 token spend (with USDT-safe reset pattern)
   * 3. Call onboard(sharesToMint, lootToMint)
   *
   * @param sharesToMint Raw share amount in wei (1e18 = 1 whole share)
   * @param lootToMint Raw loot amount in wei
   * @param proof Merkle proof (empty array if no allowlist)
   */
  async erc20TributeOnboard(
    navigatorAddress: string,
    sharesToMint: bigint,
    lootToMint: bigint,
    proof: string[] = [],
  ): Promise<void> {
    const signer = baseService.requireSigner()
    const provider = baseService.getProvider()
    const checksummedNavigator = quais.getAddress(navigatorAddress)

    const navigator = new quais.Contract(checksummedNavigator, ERC20TributeNavigatorABI, signer)
    const [tributeTokenAddr, pricePerShare, pricePerLoot] = await Promise.all([
      navigator.tributeToken(),
      navigator.pricePerShare(),
      navigator.pricePerLoot(),
    ])

    // Calculate total tribute required
    const shareTribute = (sharesToMint * BigInt(pricePerShare)) / (10n ** 18n)
    const lootTribute = (lootToMint * BigInt(pricePerLoot)) / (10n ** 18n)
    const totalTribute = shareTribute + lootTribute

    if (totalTribute === 0n) {
      throw new Error('Tribute amount is zero — check share/loot amounts and prices')
    }

    const checksummedToken = quais.getAddress(String(tributeTokenAddr))
    const signerAddress = await signer.getAddress()

    // Try ERC-2612 permit → onboardWithPermit (sign + 1 tx) before falling back to approve + onboard (2 tx)
    const permitUsed = await this.tryPermitOnboard(
      signer, provider, navigator, checksummedToken, signerAddress, checksummedNavigator,
      totalTribute, sharesToMint, lootToMint, proof,
    )

    if (!permitUsed) {
      // Fallback: ERC20 approve (USDT-safe: reset to 0 first if allowance > 0)
      const token = new quais.Contract(checksummedToken, ERC20_MINIMAL_ABI, signer)
      const currentAllowance = BigInt(await token.allowance(signerAddress, checksummedNavigator))

      if (currentAllowance > 0n && currentAllowance < totalTribute) {
        const resetTx = await token.approve(checksummedNavigator, 0n)
        await resetTx.wait()
      }
      if (currentAllowance < totalTribute) {
        const approveTx = await token.approve(checksummedNavigator, totalTribute)
        await approveTx.wait()
      }

      // Onboard
      const tx = await navigator['onboard(uint256,uint256,bytes32[])'](sharesToMint, lootToMint, proof)
      const receipt = await tx.wait()
      if (!receipt || receipt.status !== 1) {
        throw new Error('ERC20TributeNavigator.onboard transaction reverted')
      }
    }
  }

  /**
   * Attempt permit-based onboarding via onboardWithPermit().
   * Returns true if successful, false if token doesn't support permit.
   * Throws if user rejects signature or tx fails.
   */
  private async tryPermitOnboard(
    signer: quais.Signer,
    provider: quais.JsonRpcProvider,
    navigatorContract: quais.Contract,
    tokenAddress: string,
    owner: string,
    spender: string,
    value: bigint,
    sharesToMint: bigint,
    lootToMint: bigint,
    proof: string[],
  ): Promise<boolean> {
    // Probe for ERC-2612 permit support
    const tokenRead = new quais.Contract(tokenAddress, ERC20_PERMIT_PROBE_ABI, provider)
    let nonce: bigint
    try {
      nonce = BigInt(await tokenRead.nonces(owner))
    } catch {
      return false // Token doesn't support ERC-2612
    }

    const [tokenName, domainSeparator] = await Promise.all([
      new quais.Contract(tokenAddress, ERC20_MINIMAL_ABI, provider).name() as Promise<string>,
      tokenRead.DOMAIN_SEPARATOR() as Promise<string>,
    ])

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600) // 10 min
    const network = await provider.getNetwork()

    const domain = {
      name: tokenName,
      version: '1',
      chainId: network.chainId,
      verifyingContract: tokenAddress,
    }

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    }

    const message = { owner, spender, value, nonce, deadline }

    // Sign the permit (wallet prompt 1 — gasless signature)
    const signature = await signer.signTypedData(domain, types, message)
    const sig = quais.Signature.from(signature)

    // Call onboardWithPermit — single tx that does permit + onboard atomically (wallet prompt 2)
    const tx = await navigatorContract.onboardWithPermit(
      sharesToMint, lootToMint, proof, deadline, sig.v, sig.r, sig.s,
    )
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('ERC20TributeNavigator.onboardWithPermit transaction reverted')
    }

    return true
  }

  /**
   * Calculate the tribute cost for an ERC20 tribute onboard.
   *
   * Returns `-1n` as a sentinel value when the requested mint amount is
   * too small and would truncate to zero due to integer division. This
   * prevents users from submitting transactions that will revert with
   * "zero tribute" on-chain.
   */
  calculateERC20TributeCost(
    sharesToMint: bigint,
    lootToMint: bigint,
    pricePerShare: bigint,
    pricePerLoot: bigint,
  ): bigint {
    const shareTribute = (sharesToMint * pricePerShare) / (10n ** 18n)
    const lootTribute = (lootToMint * pricePerLoot) / (10n ** 18n)

    // Guard against truncation-to-zero: if the user asked for shares but
    // the division truncated the cost to 0, the on-chain call would revert.
    if (sharesToMint > 0n && pricePerShare > 0n && shareTribute === 0n) {
      return -1n
    }
    if (lootToMint > 0n && pricePerLoot > 0n && lootTribute === 0n) {
      return -1n
    }

    return shareTribute + lootTribute
  }

}

export const navigatorService = new NavigatorService()

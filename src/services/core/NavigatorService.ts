import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import { NETWORK_CONFIG } from '@/config/contracts'
import OnboarderNavigatorABI from '@/config/abi/OnboarderNavigator.json'
import ERC20TributeNavigatorABI from '@/config/abi/ERC20TributeNavigator.json'
import NFTGatedNavigatorABI from '@/config/abi/NFTGatedNavigator.json'
import SubscriptionNavigatorABI from '@/config/abi/SubscriptionNavigator.json'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorService - Navigator contract interactions
// ═══════════════════════════════════════════════════════════════════════════

import { ERC20_MINIMAL_ABI, ERC20_PERMIT_PROBE_ABI } from './navigators/shared'
import { timelockNavService } from './navigators/TimelockNavService'
import { vestingNavService } from './navigators/VestingNavService'
import { budgetNavService } from './navigators/BudgetNavService'
import { signalNavService } from './navigators/SignalNavService'
import { onboarderNavService } from './navigators/OnboarderNavService'

// Config types live in a neutral module (avoids a circular dep with the future
// per-type sub-services); re-exported here so existing `@/services/core/NavigatorService`
// type imports keep working unchanged.
export type {
  NavigatorType,
  NavigatorConfigResult,
  OnboarderNavigatorConfig,
  ERC20TributeNavigatorConfig,
  NFTGatedNavigatorConfig,
  SignalNavigatorConfig,
  BudgetNavigatorConfig,
  BudgetRemaining,
  VestingNavigatorConfig,
  TimelockNavigatorConfig,
  SubscriptionTokenOption,
  SubscriptionNavigatorConfig,
} from './navigators/types'
import type {
  NavigatorConfigResult,
  OnboarderNavigatorConfig,
  ERC20TributeNavigatorConfig,
  NFTGatedNavigatorConfig,
  SignalNavigatorConfig,
  BudgetNavigatorConfig,
  BudgetRemaining,
  VestingNavigatorConfig,
  TimelockNavigatorConfig,
  SubscriptionTokenOption,
  SubscriptionNavigatorConfig,
} from './navigators/types'

/**
 * Service for interacting with navigator contracts.
 *
 * Shipped navigators:
 * - OnboarderNavigator (MANAGER=2): Native QUAI tribute → shares/loot
 * - ERC20TributeNavigator (MANAGER=2): ERC20 token tribute → shares/loot
 * - NFTGatedNavigator (MANAGER=2): ERC-721 ownership → shares/loot (one claim per tokenId)
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
        case 'NFTGatedNavigator': {
          const config = await this.getNFTGatedConfig(navigatorAddress)
          return { type: 'NFTGatedNavigator', config }
        }
        case 'SignalNavigator': {
          const config = await this.getSignalConfig(navigatorAddress)
          return { type: 'SignalNavigator', config }
        }
        case 'BudgetNavigator': {
          const config = await this.getBudgetConfig(navigatorAddress)
          return { type: 'BudgetNavigator', config }
        }
        case 'VestingNavigator': {
          const config = await this.getVestingConfig(navigatorAddress)
          return { type: 'VestingNavigator', config }
        }
        case 'TimelockNavigator': {
          const config = await this.getTimelockConfig(navigatorAddress)
          return { type: 'TimelockNavigator', config }
        }
        case 'SubscriptionNavigator': {
          const config = await this.getSubscriptionConfig(navigatorAddress)
          return { type: 'SubscriptionNavigator', config }
        }
        default:
          // A genuinely unrecognised navigator type — this IS a legitimate result.
          return { type: 'unknown', config: null }
      }
    } catch (err) {
      // A read failure is NOT 'unknown'. Returning a resolved value here made React
      // Query cache it as a success for the full 5-minute staleTime, and
      // NavigatorDetail's `configResult?.type || navigator.navigator_type` then shadowed
      // the correct indexer type — rendering UnknownPlugin ("not yet supported") above a
      // Type field that read BudgetNavigator. The dominant trigger is simply a
      // disconnected wallet.
      throw err instanceof Error
        ? err
        : new Error(`Failed to load navigator config for ${navigatorAddress}`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OnboarderNavigator
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read the full OnboarderNavigator configuration.
   */
  getOnboarderConfig(navigatorAddress: string): Promise<OnboarderNavigatorConfig> {
    return onboarderNavService.getOnboarderConfig(navigatorAddress)
  }

  /**
   * Get amount minted to a specific address (for perAddressCap display).
   */
  getOnboarderMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    return onboarderNavService.getOnboarderMintedTo(navigatorAddress, userAddress)
  }

  /**
   * Onboard via OnboarderNavigator. Payable — sends native QUAI.
   * @param proof Merkle proof (empty array if no allowlist)
   */
  onboarderOnboard(navigatorAddress: string, value: bigint, proof: string[] = []): Promise<void> {
    return onboarderNavService.onboarderOnboard(navigatorAddress, value, proof)
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
        await confirmTx(resetTx, { label: 'Reset token allowance' })
      }
      if (currentAllowance < totalTribute) {
        // Dry-run onboard BEFORE broadcasting the approval. Otherwise any onboard
        // revert — paused navigator, mint cap reached, allowlist proof rejected,
        // expiry passed — leaves a standing allowance to the navigator with no revoke
        // path anywhere in the UI.
        try {
          await navigator['onboard(uint256,uint256,bytes32[])'].staticCall(
            sharesToMint, lootToMint, proof,
          )
        } catch (err) {
          // An allowance-related revert is expected here (we have not approved yet);
          // anything else is a genuine precondition failure worth stopping for.
          const msg = err instanceof Error ? err.message : String(err)
          if (!/allowance|insufficient|transferfrom|erc20/i.test(msg)) throw err
        }

        const approveTx = await token.approve(checksummedNavigator, totalTribute)
        await confirmTx(approveTx, { label: 'Approve tribute token' })
      }

      // Onboard
      const tx = await navigator['onboard(uint256,uint256,bytes32[])'](sharesToMint, lootToMint, proof)
      await confirmTx(tx, { label: 'ERC20TributeNavigator.onboard' })
    }
  }

  /**
   * Attempt permit-based onboarding via onboardWithPermit().
   * Returns true if successful, false if token doesn't support permit.
   * Throws if user rejects signature or tx fails.
   */
  private async tryPermitOnboard(
    signer: quais.Signer,
    // Only used as a ContractRunner for read-only quais.Contract instances —
    // quais.Provider is the accurate (and actual) type from baseService.getProvider().
    provider: quais.Provider,
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

    // Fetch on-chain domain separator — we'll verify our constructed domain against it
    let onChainDomainSeparator: string
    try {
      onChainDomainSeparator = await tokenRead.DOMAIN_SEPARATOR() as string
    } catch {
      return false // No DOMAIN_SEPARATOR — can't safely permit
    }

    // Resolve domain fields. Prefer EIP-5267 eip712Domain() if available, else probe individually.
    let domainName: string
    let domainVersion: string
    let domainChainId: bigint
    try {
      const d = await tokenRead.eip712Domain() as {
        name: string
        version: string
        chainId: bigint
        verifyingContract: string
      }
      domainName = d.name
      domainVersion = d.version
      domainChainId = BigInt(d.chainId)
    } catch {
      // Fallback: name() and version() with default '1'
      const tokenBasic = new quais.Contract(tokenAddress, ERC20_MINIMAL_ABI, provider)
      domainName = await tokenBasic.name() as string
      try {
        domainVersion = await tokenRead.version() as string
      } catch {
        domainVersion = '1'
      }
      // Use configured chainId (provider.getNetwork() on Pelagus/Quai returns
      // shard-specific IDs that don't match the token's EIP-712 binding).
      // The DOMAIN_SEPARATOR match check below catches any mismatch.
      domainChainId = BigInt(NETWORK_CONFIG.chainId)
    }

    const domain = {
      name: domainName,
      version: domainVersion,
      chainId: domainChainId,
      verifyingContract: tokenAddress,
    }

    // Verify the locally-constructed domain matches the on-chain DOMAIN_SEPARATOR.
    // If they disagree, the signature would be silently rejected on-chain — fall back
    // to the approve() path instead of signing a bad permit.
    const localDomainSeparator = quais.TypedDataEncoder.hashDomain(domain)
    if (localDomainSeparator.toLowerCase() !== onChainDomainSeparator.toLowerCase()) {
      console.warn(
        `[tryPermitOnboard] Domain separator mismatch for ${tokenAddress}. ` +
        `local=${localDomainSeparator} chain=${onChainDomainSeparator}. Falling back to approve().`,
      )
      return false
    }

    // Deadline: 10 minutes from local time. We do NOT call provider.getBlock('latest')
    // for clock-skew validation — Quai's sharded RPC requires explicit shard context
    // and the wallet provider (Pelagus) rejects shardless block queries with "Invalid shard".
    // 10 minutes is a generous enough window that typical clock skew (< 30s) is harmless.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)

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
    await confirmTx(tx, { label: 'ERC20TributeNavigator.onboardWithPermit' })

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

  // ═══════════════════════════════════════════════════════════════════════
  // NFTGatedNavigator
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read the full NFTGatedNavigator configuration from immutable on-chain views.
   * Does NOT read the gate collection itself (untrusted external contract) — the
   * plugin probes the gate (name/symbol/ownership) defensively with try/catch.
   */
  async getNFTGatedConfig(navigatorAddress: string): Promise<NFTGatedNavigatorConfig> {
    const contract = new quais.Contract(
      navigatorAddress,
      NFTGatedNavigatorABI,
      baseService.getProvider(),
    )

    const [
      gateToken, sharesPerHolder, lootPerHolder, requireTribute, tributeAmount,
      expiry, mintCap, perAddressCap, allowlistRoot,
      totalMinted, paused, navigatorType,
    ] = await Promise.all([
      contract.gateToken(),
      contract.sharesPerHolder(),
      contract.lootPerHolder(),
      contract.requireTribute(),
      contract.tributeAmount(),
      contract.expiry(),
      contract.mintCap(),
      contract.perAddressCap(),
      contract.allowlistRoot(),
      contract.totalMinted(),
      contract.paused(),
      contract.navigatorType(),
    ])

    return {
      gateToken: String(gateToken),
      sharesPerHolder: BigInt(sharesPerHolder),
      lootPerHolder: BigInt(lootPerHolder),
      requireTribute: Boolean(requireTribute),
      tributeAmount: BigInt(tributeAmount),
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
   * Read `tokenURI(tokenId)` from a gate ERC-721 collection (untrusted external contract — every
   * call is wrapped in try/catch). Used to render claimed-token images in the gallery. Returns
   * null when there's no provider, the call reverts, or the URI is empty.
   */
  async getErc721TokenURI(collection: string, tokenId: string): Promise<string | null> {
    if (!baseService.hasProvider()) return null
    try {
      const contract = new quais.Contract(
        quais.getAddress(collection),
        ['function tokenURI(uint256 tokenId) view returns (string)'],
        baseService.getProvider(),
      )
      const uri = await contract.tokenURI(BigInt(tokenId))
      return typeof uri === 'string' && uri.trim() !== '' ? uri.trim() : null
    } catch {
      return null
    }
  }

  /**
   * Amount (shares+loot) minted to an address — for perAddressCap display.
   */
  async getNFTGatedMintedTo(navigatorAddress: string, userAddress: string): Promise<bigint> {
    const contract = new quais.Contract(
      navigatorAddress,
      NFTGatedNavigatorABI,
      baseService.getProvider(),
    )
    return BigInt(await contract.mintedTo(userAddress))
  }

  /**
   * Has this specific tokenId already been claimed? (Per-token, permanent.)
   * Authoritative — read this at submit time, never trust the indexer for the
   * member's own pending claim.
   */
  async nftGatedClaimed(navigatorAddress: string, tokenId: bigint): Promise<boolean> {
    const contract = new quais.Contract(
      navigatorAddress,
      NFTGatedNavigatorABI,
      baseService.getProvider(),
    )
    return Boolean(await contract.claimed(tokenId))
  }

  /**
   * Preflight: does NOT cover tribute or caps (by contract design). Returns false
   * if paused, expired, already claimed, or the candidate doesn't currently own the
   * token. Never reverts.
   */
  async nftGatedCanOnboard(
    navigatorAddress: string,
    candidate: string,
    tokenId: bigint,
  ): Promise<boolean> {
    const contract = new quais.Contract(
      navigatorAddress,
      NFTGatedNavigatorABI,
      baseService.getProvider(),
    )
    return Boolean(await contract.canOnboard(candidate, tokenId))
  }

  /**
   * Onboard by claiming an owned gate NFT. Payable — sends the exact native
   * tribute (0n in free-mint mode).
   *
   * Overload selection follows the on-chain allowlist (audit M-04):
   * - `proof === null`  → no allowlist → `onboard(uint256)`
   * - `proof` provided  → allowlist active → `onboard(uint256,bytes32[])`
   *
   * @param tributeValue Exact native tribute in wei (pass the on-chain `tributeAmount`
   *                     verbatim; 0n when `requireTribute` is false).
   */
  async nftGatedOnboard(
    navigatorAddress: string,
    tokenId: bigint,
    tributeValue: bigint,
    proof: string[] | null = null,
  ): Promise<void> {
    const contract = new quais.Contract(
      navigatorAddress,
      NFTGatedNavigatorABI,
      baseService.requireSigner(),
    )
    const tx = proof === null
      ? await contract['onboard(uint256)'](tokenId, { value: tributeValue })
      : await contract['onboard(uint256,bytes32[])'](tokenId, proof, { value: tributeValue })
    await confirmTx(tx, { label: 'NFTGatedNavigator.onboard' })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SignalNavigator (read-only, non-binding polls)
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the SignalNavigator's immutable config + current poll count. */
  getSignalConfig(navigatorAddress: string): Promise<SignalNavigatorConfig> {
    return signalNavService.getSignalConfig(navigatorAddress)
  }

  /** Has `voter` already voted on a poll? (Authoritative on-chain read.) */
  signalHasVoted(navigatorAddress: string, pollId: bigint, voter: string): Promise<boolean> {
    return signalNavService.signalHasVoted(navigatorAddress, pollId, voter)
  }

  /** Poll status enum: 0=Pending, 1=Active, 2=Ended, 3=Cancelled. */
  signalPollStatus(navigatorAddress: string, pollId: bigint): Promise<number> {
    return signalNavService.signalPollStatus(navigatorAddress, pollId)
  }

  /**
   * Create a poll. `startTime` is an absolute unix timestamp (0 = open now; else
   * now..now+maxStartDelay). `duration` is in seconds, within [minDuration, maxDuration].
   * `optionCount` must be 2..10.
   */
  signalCreatePoll(
    navigatorAddress: string,
    question: string,
    optionCount: number,
    startTime: bigint,
    duration: bigint,
  ): Promise<bigint> {
    return signalNavService.signalCreatePoll(navigatorAddress, question, optionCount, startTime, duration)
  }

  /** Cast a vote. Weight is the snapshot share power (loot excluded), resolved on-chain. */
  signalVote(navigatorAddress: string, pollId: bigint, option: number): Promise<void> {
    return signalNavService.signalVote(navigatorAddress, pollId, option)
  }

  /** Cancel a poll (creator before start; avatar before end). */
  signalCancelPoll(navigatorAddress: string, pollId: bigint): Promise<void> {
    return signalNavService.signalCancelPoll(navigatorAddress, pollId)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BudgetNavigator (MODULE class — treasury disbursement, no DAOShip permission)
  // ───────────────────────────────────────────────────────────────────────
  // Authority is being an enabled Zodiac module on the DAO's vault. Budgets and
  // their static config come from the indexer (ds_budgets); on-chain we only read
  // the LIVE figures (remaining* reset lazily) + paused, and submit manager/admin txs.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the BudgetNavigator's immutable config + current budget count + pause flag. */
  getBudgetConfig(navigatorAddress: string): Promise<BudgetNavigatorConfig> {
    return budgetNavService.getBudgetConfig(navigatorAddress)
  }

  /**
   * Live remaining figures for one budget — both reset/accrue lazily on-chain, so
   * read them fresh before a disburse to disable a too-large amount before it reverts.
   */
  getBudgetRemaining(navigatorAddress: string, budgetId: bigint): Promise<BudgetRemaining> {
    return budgetNavService.getBudgetRemaining(navigatorAddress, budgetId)
  }

  /** Authoritative pause flag (freezes ALL disbursement). */
  getBudgetPaused(navigatorAddress: string): Promise<boolean> {
    return budgetNavService.getBudgetPaused(navigatorAddress)
  }

  /**
   * Is this navigator currently an enabled module on the given vault? The
   * unforgeable source of truth behind trust_status — confirm before disbursing.
   */
  isModuleEnabled(vaultAddress: string, navigatorAddress: string): Promise<boolean> {
    return budgetNavService.isModuleEnabled(vaultAddress, navigatorAddress)
  }

  /** Disburse a single payout from a budget. Manager-only (reverts otherwise). */
  budgetDisburse(
    navigatorAddress: string,
    budgetId: bigint,
    to: string,
    amount: bigint,
  ): Promise<void> {
    return budgetNavService.budgetDisburse(navigatorAddress, budgetId, to, amount)
  }

  /** Batch payroll disbursement (atomic). Manager-only; `to` and `amounts` must align. */
  budgetDisburseBatch(
    navigatorAddress: string,
    budgetId: bigint,
    to: string[],
    amounts: bigint[],
  ): Promise<void> {
    return budgetNavService.budgetDisburseBatch(navigatorAddress, budgetId, to, amounts)
  }

  /** Freeze ALL disbursement (the fast brake). GOVERNOR navigator or avatar only. */
  budgetPause(navigatorAddress: string): Promise<void> {
    return budgetNavService.budgetPause(navigatorAddress)
  }

  /** Resume disbursement. GOVERNOR navigator or avatar only. */
  budgetUnpause(navigatorAddress: string): Promise<void> {
    return budgetNavService.budgetUnpause(navigatorAddress)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VestingNavigator (MANAGER — mints shares/loot on a cliff + linear schedule)
  // ───────────────────────────────────────────────────────────────────────
  // Schedules + their static config come from the indexer (ds_vesting_schedules);
  // schedules are created/revoked by governance (avatar-only → proposals). On-chain
  // we read the LIVE claimable (authoritative preflight) and submit the beneficiary
  // claim directly. No escrow — claim() mints vested-but-unclaimed TO THE BENEFICIARY.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the VestingNavigator's config: schedule count, pause flag, DAO binding. */
  getVestingConfig(navigatorAddress: string): Promise<VestingNavigatorConfig> {
    return vestingNavService.getVestingConfig(navigatorAddress)
  }

  /**
   * Live claimable for one schedule — the authoritative preflight (read fresh before
   * claiming to disable the button when nothing has vested). Mirrors the indexer's
   * derived `claimable`, but on-chain and lag-free.
   */
  getVestingClaimable(navigatorAddress: string, scheduleId: bigint): Promise<bigint> {
    return vestingNavService.getVestingClaimable(navigatorAddress, scheduleId)
  }

  /** Live total-vested for one schedule (minted + still-claimable). */
  getVestingVested(navigatorAddress: string, scheduleId: bigint): Promise<bigint> {
    return vestingNavService.getVestingVested(navigatorAddress, scheduleId)
  }

  /** The schedule IDs for a beneficiary (on-chain view). */
  getVestingSchedules(navigatorAddress: string, beneficiary: string): Promise<bigint[]> {
    return vestingNavService.getVestingSchedules(navigatorAddress, beneficiary)
  }

  /**
   * Claim vested-but-unclaimed tokens for a schedule. Callable by the beneficiary OR
   * the avatar; ALWAYS mints to the schedule's beneficiary (never the caller).
   */
  vestingClaim(navigatorAddress: string, scheduleId: bigint): Promise<void> {
    return vestingNavService.vestingClaim(navigatorAddress, scheduleId)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TimelockNavigator (GOVERNOR — delays governance-config changes)
  // ───────────────────────────────────────────────────────────────────────
  // Queued changes + their full config bytes come from the indexer (ds_timelock_changes).
  // queue/cancel/emergencyCancelAll/pause are avatar-only → governance proposals (deep-links).
  // executeChange is PERMISSIONLESS once matured — anyone can crank it directly.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the TimelockNavigator's config: change count, pause flag, delay, expiry window. */
  getTimelockConfig(navigatorAddress: string): Promise<TimelockNavigatorConfig> {
    return timelockNavService.getTimelockConfig(navigatorAddress)
  }

  /** Is this change executable right now? (Authoritative on-chain preflight.) */
  timelockIsExecutable(navigatorAddress: string, changeId: bigint): Promise<boolean> {
    return timelockNavService.timelockIsExecutable(navigatorAddress, changeId)
  }

  /**
   * Execute a matured queued change — PERMISSIONLESS (anyone can crank). You MUST pass
   * the exact `governanceConfig` bytes from the indexed row; the hash won't reconstruct
   * them (wrong bytes → ConfigHashMismatch).
   */
  timelockExecuteChange(
    navigatorAddress: string,
    changeId: bigint,
    governanceConfig: string,
  ): Promise<void> {
    return timelockNavService.timelockExecuteChange(navigatorAddress, changeId, governanceConfig)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SubscriptionNavigator (MANAGER — recurring membership dues)
  // ───────────────────────────────────────────────────────────────────────
  // Immutable config (token menu, fees, period, grace, reward, enforcement) is read once.
  // Members pull-pay via payFee/payFeeFor (exact native value, or ERC-20 approve); anyone
  // may collectFee a delinquent member. enroll/pause/withdraw are avatar-only → proposals.
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the full (immutable) SubscriptionNavigator config + the accepted-token fee menu. */
  async getSubscriptionConfig(navigatorAddress: string): Promise<SubscriptionNavigatorConfig> {
    const contract = new quais.Contract(navigatorAddress, SubscriptionNavigatorABI, baseService.getProvider())

    const [
      periodDuration, graceDuration, startTime, collectorRewardBps,
      burnOnCollect, paused, acceptedTokens, daoShip, navigatorType,
    ] = await Promise.all([
      contract.periodDuration(),
      contract.graceDuration(),
      contract.startTime(),
      contract.collectorRewardBps(),
      contract.burnOnCollect(),
      contract.paused(),
      contract.getAcceptedTokens(),
      contract.daoShip(),
      contract.navigatorType(),
    ])

    // Resolve the fee + metadata for each accepted token (native = QUAI/18; ERC-20 probed).
    const tokenAddrs = (acceptedTokens as string[]).map((t) => String(t))
    const tokens: SubscriptionTokenOption[] = await Promise.all(
      tokenAddrs.map(async (addr): Promise<SubscriptionTokenOption> => {
        const feePerPeriod = BigInt(await contract.feePerPeriod(addr))
        const isNative = addr === quais.ZeroAddress
        if (isNative) {
          return { address: addr, isNative: true, feePerPeriod, symbol: 'QUAI', decimals: 18 }
        }
        let symbol = 'TOKEN'
        let decimals = 18
        try {
          const token = new quais.Contract(addr, ERC20_MINIMAL_ABI, baseService.getProvider())
          const [sym, dec] = await Promise.all([token.symbol(), token.decimals()])
          symbol = sym
          decimals = Number(dec)
        } catch {
          // metadata read failed — defaults
        }
        return { address: addr, isNative: false, feePerPeriod, symbol, decimals }
      }),
    )

    return {
      periodDuration: BigInt(periodDuration),
      graceDuration: BigInt(graceDuration),
      startTime: BigInt(startTime),
      collectorRewardBps: BigInt(collectorRewardBps),
      burnOnCollect: Boolean(burnOnCollect),
      paused: Boolean(paused),
      tokens,
      daoShip: String(daoShip),
      navigatorType: String(navigatorType),
    }
  }

  /** Total cost for `periods` periods in `token` (reverts TokenNotAccepted on a bad token). */
  async subscriptionQuote(navigatorAddress: string, periods: bigint, token: string): Promise<bigint> {
    const contract = new quais.Contract(navigatorAddress, SubscriptionNavigatorABI, baseService.getProvider())
    return BigInt(await contract.quote(periods, token))
  }

  /** A member's absolute paid-through timestamp (unix seconds; 0 = not enrolled). */
  async subscriptionPaidThrough(navigatorAddress: string, member: string): Promise<bigint> {
    const contract = new quais.Contract(navigatorAddress, SubscriptionNavigatorABI, baseService.getProvider())
    return BigInt(await contract.paidThrough(member))
  }

  /** Authoritative collectible check (matches the keeper-collection precondition). */
  async subscriptionIsDelinquent(navigatorAddress: string, member: string): Promise<boolean> {
    const contract = new quais.Contract(navigatorAddress, SubscriptionNavigatorABI, baseService.getProvider())
    return Boolean(await contract.isDelinquent(member))
  }

  /**
   * Pay your own dues. Native (token == ZeroAddress) sends `value = quote(periods, token)`
   * exactly; ERC-20 approves the navigator for the quote then pays with no value.
   */
  async subscriptionPayFee(
    navigatorAddress: string,
    periods: bigint,
    token: string,
  ): Promise<void> {
    return this._subscriptionPay(navigatorAddress, null, periods, token)
  }

  /** Sponsor another member's dues (same value rules; tokens/native funded by the caller). */
  async subscriptionPayFeeFor(
    navigatorAddress: string,
    member: string,
    periods: bigint,
    token: string,
  ): Promise<void> {
    return this._subscriptionPay(navigatorAddress, member, periods, token)
  }

  /** Shared pay path: handles native exact-value and the ERC-20 approve → pay flow. */
  private async _subscriptionPay(
    navigatorAddress: string,
    member: string | null,
    periods: bigint,
    token: string,
  ): Promise<void> {
    const signer = baseService.requireSigner()
    const checksummedNav = quais.getAddress(navigatorAddress)
    const navigator = new quais.Contract(checksummedNav, SubscriptionNavigatorABI, signer)

    const cost = BigInt(await navigator.quote(periods, token))
    const isNative = token === quais.ZeroAddress

    if (!isNative) {
      // ERC-20: approve exactly the cost (USDT-safe reset if a partial allowance exists).
      const erc20 = new quais.Contract(quais.getAddress(token), ERC20_MINIMAL_ABI, signer)
      const owner = await signer.getAddress()
      const current = BigInt(await erc20.allowance(owner, checksummedNav))
      if (current > 0n && current < cost) {
        const reset = await erc20.approve(checksummedNav, 0n)
        await confirmTx(reset, { label: 'Reset token allowance' })
      }
      if (current < cost) {
        const approve = await erc20.approve(checksummedNav, cost)
        await confirmTx(approve, { label: 'Approve subscription token' })
      }
    }

    const value = isNative ? cost : 0n
    const tx = member === null
      ? await navigator.payFee(periods, token, { value })
      : await navigator.payFeeFor(quais.getAddress(member), periods, token, { value })
    await confirmTx(tx, { label: 'SubscriptionNavigator.payFee' })
  }

  /**
   * Collect a delinquent member — PERMISSIONLESS. Strips their shares (burned or converted
   * to loot per config) and mints the keeper a loot reward. Reverts NotDelinquent /
   * NoSharesToBurn, or if removing a large member would breach the sponsor threshold.
   */
  async subscriptionCollectFee(navigatorAddress: string, member: string): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, SubscriptionNavigatorABI, baseService.requireSigner())
    const tx = await contract.collectFee(quais.getAddress(member))
    await confirmTx(tx, { label: 'SubscriptionNavigator.collectFee' })
  }

}

export const navigatorService = new NavigatorService()

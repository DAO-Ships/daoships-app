// ═══════════════════════════════════════════════════════════════════════════
// ERC20TributeNavService — ERC20TributeNavigator (MANAGER — ERC-20 tribute → shares/loot)
// ───────────────────────────────────────────────────────────────────────────
// Onboard tries the gasless ERC-2612 permit → single-tx onboardWithPermit first,
// falling back to the USDT-safe approve → onboard path.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import { NETWORK_CONFIG } from '@/config/contracts'
import ERC20TributeNavigatorABI from '@/config/abi/ERC20TributeNavigator.json'
import { ERC20_MINIMAL_ABI, ERC20_PERMIT_PROBE_ABI } from './shared'
import type { ERC20TributeNavigatorConfig } from './types'

class ERC20TributeNavService {
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
}

export const erc20TributeNavService = new ERC20TributeNavService()

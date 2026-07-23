// ═══════════════════════════════════════════════════════════════════════════
// NFTGatedNavService — NFTGatedNavigator (MANAGER — ERC-721 ownership → shares/loot)
// ───────────────────────────────────────────────────────────────────────────
// One claim per tokenId. The gate collection is an untrusted external contract, so
// every read against it (tokenURI) is defensively wrapped.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import NFTGatedNavigatorABI from '@/config/abi/NFTGatedNavigator.json'
import type { NFTGatedNavigatorConfig } from './types'

class NFTGatedNavService {
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
}

export const nftGatedNavService = new NFTGatedNavService()

// ═══════════════════════════════════════════════════════════════════════════
// OnboarderNavService — OnboarderNavigator (MANAGER — native QUAI tribute → shares/loot)
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import OnboarderNavigatorABI from '@/config/abi/OnboarderNavigator.json'
import type { OnboarderNavigatorConfig } from './types'

class OnboarderNavService {
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
    await confirmTx(tx, { label: 'OnboarderNavigator.onboard' })
  }
}

export const onboarderNavService = new OnboarderNavService()

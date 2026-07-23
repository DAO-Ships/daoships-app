// ═══════════════════════════════════════════════════════════════════════════
// SubscriptionNavService — SubscriptionNavigator (MANAGER — recurring membership dues)
// ───────────────────────────────────────────────────────────────────────────
// Immutable config (token menu, fees, period, grace, reward, enforcement) is read once.
// Members pull-pay via payFee/payFeeFor (exact native value, or ERC-20 approve); anyone
// may collectFee a delinquent member. enroll/pause/withdraw are avatar-only → proposals.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import SubscriptionNavigatorABI from '@/config/abi/SubscriptionNavigator.json'
import { ERC20_MINIMAL_ABI } from './shared'
import type { SubscriptionNavigatorConfig, SubscriptionTokenOption } from './types'

class SubscriptionNavService {
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

export const subscriptionNavService = new SubscriptionNavService()

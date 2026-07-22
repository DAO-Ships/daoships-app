import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import {
  getGasPrice,
  getNativeBalance,
  modelDeployGas,
  modelLaunchGas,
  modelPostGas,
  ESTIMATE_BUFFER_PERCENT,
  LOW_BALANCE_WARN_PERCENT,
} from '@/services/utils/LaunchGasEstimator'
import { ONBOARDER_NAVIGATOR_BYTECODE } from '@/config/abi/OnboarderNavigator.bytecode'
import { ERC20_TRIBUTE_NAVIGATOR_BYTECODE } from '@/config/abi/ERC20TributeNavigator.bytecode'
import type { LaunchFormValues } from '@/components/launch/steps/BasicInfoStep'

// ═══════════════════════════════════════════════════════════════════════════
// useLaunchCost - Modeled QUAI cost of a DAO launch, priced at the live gas price
//
// Feeds the Review step's cost breakdown and its insufficient-balance gate.
// The numbers are modeled (see LaunchGasEstimator) because the launch
// transactions cannot be simulated until the CREATE2 salts are mined; exact
// per-transaction checks happen inside the launch services at signing time.
// ═══════════════════════════════════════════════════════════════════════════

export interface LaunchCostLine {
  id: string
  label: string
  gas: bigint
  /** gas × gasPrice, or null when the gas price is unknown. */
  cost: bigint | null
}

export interface LaunchCostEstimate {
  lines: LaunchCostLine[]
  totalGas: bigint
  gasPrice: bigint | null
  /** Raw modeled total, before headroom. */
  totalCost: bigint | null
  /** Total plus ESTIMATE_BUFFER_PERCENT headroom — what the gate compares against. */
  requiredBalance: bigint | null
  balance: bigint | null
  /** Balance is known and below the buffered total. Blocks the launch. */
  insufficient: boolean
  /** True while gas price or balance is still unresolved — insufficient is conservative. */
  costUnknown: boolean
  /** Balance clears the gate but by less than LOW_BALANCE_WARN_PERCENT. */
  low: boolean
  /** Shortfall when insufficient, else 0n. */
  shortfall: bigint
}

/**
 * Estimate the gas each launch step will burn, from the wizard's form state.
 * Pure and synchronous — pricing is applied separately so the shape can be
 * memoized independently of the live gas price.
 */
export function buildLaunchGasLines(formData: LaunchFormValues): Omit<LaunchCostLine, 'cost'>[] {
  const lines: Omit<LaunchCostLine, 'cost'>[] = []

  let navigatorCount = 0
  if (formData.enableOnboarder) {
    navigatorCount++
    lines.push({
      id: 'onboarder',
      label: 'Deploy Onboarder Navigator',
      gas: modelDeployGas(ONBOARDER_NAVIGATOR_BYTECODE),
    })
  }
  if (formData.enableERC20Tribute) {
    navigatorCount++
    lines.push({
      id: 'erc20tribute',
      label: 'Deploy ERC-20 Tribute Navigator',
      gas: modelDeployGas(ERC20_TRIBUTE_NAVIGATOR_BYTECODE),
    })
  }

  lines.push({
    id: 'launch',
    label: 'Launch DAO (vault, tokens, DAOShip)',
    gas: modelLaunchGas({
      memberCount: formData.members.filter(m => m.address.trim()).length,
      guildTokenCount: formData.guildTokens.length,
      navigatorCount,
      vaultOwnerCount: formData.vaultOwners.filter(o => o.address.trim()).length,
    }),
  })

  // The profile post's cost tracks its JSON size closely enough to model from
  // the same fields ReviewStep will post.
  const profileBytes = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: '1.0',
      name: formData.name,
      description: formData.description,
      avatar: formData.avatarUrl,
      banner: formData.bannerUrl,
      theme: formData.theme,
      links: formData.links,
    }),
  ).length
  lines.push({
    id: 'profile',
    label: 'Post DAO profile',
    gas: modelPostGas(profileBytes),
  })

  return lines
}

/**
 * Price the modeled launch against the live gas price and the connected
 * wallet's balance. Refetches periodically so a long stay on the Review step
 * does not quote a stale gas price.
 */
export function useLaunchCost(formData: LaunchFormValues): LaunchCostEstimate {
  const { address, isConnected } = useAccount()

  const { data } = useQuery({
    queryKey: ['launchCost', address],
    queryFn: async () => {
      const [gasPrice, balance] = await Promise.all([
        getGasPrice(address),
        address ? getNativeBalance(address) : Promise.resolve(null),
      ])
      return { gasPrice, balance }
    },
    enabled: isConnected && !!address,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const gasPrice = data?.gasPrice ?? null
  const balance = data?.balance ?? null

  const gasLines = buildLaunchGasLines(formData)
  const lines: LaunchCostLine[] = gasLines.map(l => ({
    ...l,
    cost: gasPrice == null ? null : l.gas * gasPrice,
  }))
  const totalGas = gasLines.reduce((sum, l) => sum + l.gas, 0n)
  const totalCost = gasPrice == null ? null : totalGas * gasPrice
  const requiredBalance =
    totalCost == null ? null : (totalCost * (100n + ESTIMATE_BUFFER_PERCENT)) / 100n

  // Unknown cost must BLOCK, not read as affordable. The query resolves successfully
  // with {gasPrice: null, balance: null} for ~30s after connect — before the wallet
  // provider is installed — so the old `balance != null &&` guard made `insufficient`
  // false and opened the gate on a 3-4 transaction paid pipeline the user might not be
  // able to fund. `costUnknown` is exposed so the UI can say "checking…" rather than
  // claiming a shortfall.
  const costUnknown = requiredBalance == null || balance == null
  const insufficient = costUnknown ? true : balance < requiredBalance
  const low =
    !insufficient &&
    !costUnknown &&
    requiredBalance != null &&
    balance != null &&
    balance < (requiredBalance * (100n + LOW_BALANCE_WARN_PERCENT)) / 100n

  return {
    costUnknown,
    lines,
    totalGas,
    gasPrice,
    totalCost,
    requiredBalance,
    balance,
    insufficient,
    low,
    shortfall: insufficient && requiredBalance != null && balance != null ? requiredBalance - balance : 0n,
  }
}

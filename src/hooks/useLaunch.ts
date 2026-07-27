import { useMutation, useQueryClient } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { encodeGovernanceConfig } from '@/services/utils/GovernanceEncoder'
import { encodeLaunchInitParams } from '@/services/utils/LaunchEncoder'
import { CONTRACT_ADDRESSES } from '@/config/contracts'

export interface LaunchParams {
  salts: { vault: string; shares: string; loot: string; daoShip: string }
  governanceConfig: {
    votingPeriod: number
    gracePeriod: number
    proposalOffering: bigint
    quorumPercent: number
    sponsorThreshold: bigint
    minRetentionPercent: number
    defaultExpiryWindow: number
  }
  tokenConfig: {
    shareTokenName: string
    shareTokenSymbol: string
    lootTokenName: string
    lootTokenSymbol: string
    pauseSharesOnLaunch: boolean
    pauseLootOnLaunch: boolean
  }
  members: { address: string; shares: bigint; loot: bigint }[]
  guildTokens: string[]
  navigators: string[]
  navigatorPermissions: bigint[]
  vaultOwners: string[]
  vaultThreshold: number
}

export function useLaunch() {
  const queryClient = useQueryClient()

  const launchMutation = useMutation({
    mutationFn: async (params: LaunchParams) => {
      // Encode 7-param governance config (uint32, uint32, uint256, uint256, uint256, uint256, uint32)
      const govConfigBytes = encodeGovernanceConfig({
        votingPeriod: params.governanceConfig.votingPeriod,
        gracePeriod: params.governanceConfig.gracePeriod,
        proposalOffering: params.governanceConfig.proposalOffering,
        quorumPercent: BigInt(params.governanceConfig.quorumPercent),
        sponsorThreshold: params.governanceConfig.sponsorThreshold,
        minRetentionPercent: BigInt(params.governanceConfig.minRetentionPercent),
        defaultExpiryWindow: params.governanceConfig.defaultExpiryWindow,
      })

      // Build parallel arrays for members (must all be same length)
      const memberAddresses = params.members.map(m => m.address)
      const shareAmounts = params.members.map(m => m.shares)
      const lootAmounts = params.members.map(m => m.loot)

      // The 13-field template lives in LaunchEncoder, which validates what it can
      // (parallel-array lengths, guild-token ordering, a non-empty governance
      // blob) before the chain does. Field order is consensus-critical and pinned
      // by test there; keeping it inline here left it unverified.
      const initializationParamsTemplate = encodeLaunchInitParams({
        multisendLibrary: CONTRACT_ADDRESSES.MULTISEND_CALL_ONLY,
        governanceConfig: govConfigBytes,
        navigators: params.navigators,
        navigatorPermissions: params.navigatorPermissions,
        initMembers: memberAddresses,
        initShareAmounts: shareAmounts,
        initLootAmounts: lootAmounts,
        guildTokens: params.guildTokens,
        pauseSharesOnLaunch: params.tokenConfig.pauseSharesOnLaunch,
        pauseLootOnLaunch: params.tokenConfig.pauseLootOnLaunch,
      })

      if (params.vaultOwners.length === 0) {
        throw new Error(
          'At least one vault owner is required. A vault with no owners (ZERO_ADDRESS) would be permanently locked.',
        )
      }

      return daoService.launchDAOShipAndVault(
        initializationParamsTemplate,
        params.tokenConfig.shareTokenName,
        params.tokenConfig.shareTokenSymbol,
        params.tokenConfig.lootTokenName,
        params.tokenConfig.lootTokenSymbol,
        params.vaultOwners,
        BigInt(params.vaultThreshold),
        BigInt(params.salts.vault),
        BigInt(params.salts.shares),
        BigInt(params.salts.loot),
        BigInt(params.salts.daoShip),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daos'] })
      queryClient.invalidateQueries({ queryKey: ['userDaos'] })
    },
  })

  return {
    launch: launchMutation.mutateAsync,
    isLaunching: launchMutation.isPending,
    error: launchMutation.error,
  }
}

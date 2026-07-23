// ═══════════════════════════════════════════════════════════════════════════
// DAO contract-instance helpers (lazy; provider for reads / signer for writes)
// ───────────────────────────────────────────────────────────────────────────
// Shared by the read / write / launch DAO sub-services and the DaoService facade.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { CONTRACT_ADDRESSES } from '@/config/contracts'
import DAOShipAbi from '@/config/abi/DAOShip.json'
import DAOShipAndVaultLauncherAbi from '@/config/abi/DAOShipAndVaultLauncher.json'
import SharesERC20Abi from '@/config/abi/SharesERC20.json'
import LootERC20Abi from '@/config/abi/LootERC20.json'
import PosterAbi from '@/config/abi/Poster.json'
import ERC20TributeNavigatorAbi from '@/config/abi/ERC20TributeNavigator.json'
import OnboarderNavigatorAbi from '@/config/abi/OnboarderNavigator.json'

export function getDAOShipContract(daoId: string): quais.Contract {
  return new quais.Contract(quais.getAddress(daoId), DAOShipAbi, baseService.getProvider())
}

export function getDAOShipContractWithSigner(daoId: string): quais.Contract {
  return new quais.Contract(quais.getAddress(daoId), DAOShipAbi, baseService.requireSigner())
}

export function getLauncherContract(): quais.Contract {
  return new quais.Contract(
    CONTRACT_ADDRESSES.DAOSHIP_AND_VAULT_LAUNCHER,
    DAOShipAndVaultLauncherAbi,
    baseService.requireSigner()
  )
}

export function getSharesContract(sharesAddress: string): quais.Contract {
  return new quais.Contract(quais.getAddress(sharesAddress), SharesERC20Abi, baseService.getProvider())
}

export function getSharesContractWithSigner(sharesAddress: string): quais.Contract {
  return new quais.Contract(quais.getAddress(sharesAddress), SharesERC20Abi, baseService.requireSigner())
}

export function getLootContract(lootAddress: string): quais.Contract {
  return new quais.Contract(quais.getAddress(lootAddress), LootERC20Abi, baseService.getProvider())
}

export function getPosterContractWithSigner(): quais.Contract {
  return new quais.Contract(CONTRACT_ADDRESSES.POSTER, PosterAbi, baseService.requireSigner())
}

export function getERC20TributeNavigatorContract(navigatorAddress: string): quais.Contract {
  return new quais.Contract(quais.getAddress(navigatorAddress), ERC20TributeNavigatorAbi, baseService.getProvider())
}

export function getERC20TributeNavigatorContractWithSigner(navigatorAddress: string): quais.Contract {
  return new quais.Contract(quais.getAddress(navigatorAddress), ERC20TributeNavigatorAbi, baseService.requireSigner())
}

export function getOnboarderNavigatorContractWithSigner(navigatorAddress: string): quais.Contract {
  return new quais.Contract(quais.getAddress(navigatorAddress), OnboarderNavigatorAbi, baseService.requireSigner())
}

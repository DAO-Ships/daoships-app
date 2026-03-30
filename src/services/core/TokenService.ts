import { quais } from 'quais'
import { baseService } from './BaseService.ts'
import SharesERC20ABI from '@/config/abi/SharesERC20.json'
import LootERC20ABI from '@/config/abi/LootERC20.json'

// ═══════════════════════════════════════════════════════════════════════════
// TokenService - SharesERC20 and LootERC20 token interaction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provides read and write access to SharesERC20 (with voting/delegation)
 * and LootERC20 (standard ERC20 without voting) token contracts.
 *
 * Generic ERC20 read methods (getBalance, getName, getSymbol, etc.) work
 * with both token types since they share the same base interface.
 */
class TokenService {

  // ─── Private helpers ──────────────────────────────────────────────────

  private getSharesReadContract(sharesAddress: string): quais.Contract {
    return new quais.Contract(sharesAddress, SharesERC20ABI, baseService.getProvider())
  }

  private getSharesWriteContract(sharesAddress: string): quais.Contract {
    return new quais.Contract(sharesAddress, SharesERC20ABI, baseService.requireSigner())
  }

  // ─── SharesERC20 Write operations ────────────────────────────────────

  /**
   * Delegate voting power to another address.
   * Delegates must call this to activate their own votes as well (self-delegate).
   */
  async delegate(sharesAddress: string, to: string): Promise<void> {
    const contract = this.getSharesWriteContract(sharesAddress)
    const tx = await contract.delegate(to)
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('delegate transaction reverted')
    }
  }

  // ─── SharesERC20 Read operations (voting/delegation) ─────────────────

  /**
   * Get the address that `account` has delegated their shares voting power to.
   */
  async getDelegates(sharesAddress: string, account: string): Promise<string> {
    const contract = this.getSharesReadContract(sharesAddress)
    return await contract.delegates(account)
  }

  /**
   * Get the current voting power for an account (after delegation).
   */
  async getVotes(sharesAddress: string, account: string): Promise<bigint> {
    const contract = this.getSharesReadContract(sharesAddress)
    return await contract.getCurrentVotes(account)
  }

  /**
   * Get the voting power for an account at a past timestamp (block-based checkpoint).
   */
  async getPastVotes(sharesAddress: string, account: string, timestamp: bigint): Promise<bigint> {
    const contract = this.getSharesReadContract(sharesAddress)
    return await contract.getPastVotes(account, timestamp)
  }

  // ─── Generic ERC20 Read operations (work for both Shares and Loot) ───

  /**
   * Get the token balance of an account.
   * Works for both SharesERC20 and LootERC20 addresses.
   */
  async getBalance(tokenAddress: string, account: string): Promise<bigint> {
    // Both Shares and Loot have balanceOf — use Loot ABI since it's the simpler superset
    const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
    return await contract.balanceOf(account)
  }

  /**
   * Get the token name.
   */
  async getName(tokenAddress: string): Promise<string> {
    const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
    return await contract.name()
  }

  /**
   * Get the token symbol.
   */
  async getSymbol(tokenAddress: string): Promise<string> {
    const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
    return await contract.symbol()
  }

  /**
   * Get the token decimals.
   */
  async getDecimals(tokenAddress: string): Promise<number> {
    const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
    const decimals = await contract.decimals()
    return Number(decimals)
  }

  /**
   * Get the token total supply.
   */
  async getTotalSupply(tokenAddress: string): Promise<bigint> {
    const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
    return await contract.totalSupply()
  }

  /**
   * Check if the token is currently paused.
   */
  async isPaused(tokenAddress: string): Promise<boolean> {
    const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
    return await contract.paused()
  }

  /**
   * Verify that an address is a valid ERC-20 contract by calling name(), symbol(),
   * and decimals(). Returns token metadata on success, or null if the address is
   * not a valid ERC-20.
   */
  async verifyERC20(tokenAddress: string): Promise<{ name: string; symbol: string; decimals: number } | null> {
    try {
      const contract = new quais.Contract(tokenAddress, LootERC20ABI, baseService.getProvider())
      const [name, symbol, rawDecimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ])
      return { name, symbol, decimals: Number(rawDecimals) }
    } catch {
      return null
    }
  }
}

export const tokenService = new TokenService()

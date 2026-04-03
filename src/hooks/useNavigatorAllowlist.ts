import { useQuery } from '@tanstack/react-query'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { recordIndexerService } from '@/services/indexer/RecordIndexerService'
import {
  getAllowlistProof,
  isAllowlisted,
  verifyAllowlistRoot,
  isOpenAllowlist,
  type AllowlistTreeDump,
} from '@/utils/allowlist'

/**
 * Fetches and caches the allowlist for a navigator contract.
 *
 * Given a navigator's on-chain allowlistRoot, this hook:
 * 1. Fetches the stored tree dump from the indexer (posted via Poster at deploy time)
 * 2. Verifies the reconstructed root matches the on-chain root
 * 3. Exposes helpers to check membership and generate proofs
 *
 * Returns null helpers when the navigator has no allowlist (open access)
 * or when the allowlist data is unavailable.
 */
export function useNavigatorAllowlist(
  daoId: string | undefined,
  navigatorAddress: string | undefined,
  allowlistRoot: string | undefined,
) {
  const isOpen = isOpenAllowlist(allowlistRoot)

  const { data: treeDump, isLoading, error } = useQuery({
    queryKey: ['navigatorAllowlist', daoId, navigatorAddress],
    queryFn: async (): Promise<AllowlistTreeDump | null> => {
      const record = await recordIndexerService.getNavigatorAllowlist(daoId!, navigatorAddress!)
      if (!record?.content_json) return null

      const json = record.content_json as Record<string, unknown>
      const dump = json.treeDump as AllowlistTreeDump | undefined
      if (!dump) return null

      // Verify integrity — reconstructed root must match on-chain root
      if (!verifyAllowlistRoot(dump, allowlistRoot!)) {
        console.warn('[useNavigatorAllowlist] Root mismatch — stored data does not match on-chain root')
        return null
      }

      return dump
    },
    enabled: !!daoId && !!navigatorAddress && !isOpen,
    staleTime: Infinity, // Allowlists are immutable — never refetch
  })

  // Extract address list from tree dump for display
  const addresses: string[] = []
  if (treeDump) {
    try {
      const tree = StandardMerkleTree.load(treeDump)
      for (const [, v] of tree.entries()) {
        addresses.push(v[0])
      }
    } catch { /* tree load failed */ }
  }

  return {
    /** True if the navigator has no allowlist (open access) */
    isOpen,
    /** True while fetching the allowlist data from the indexer */
    isLoading: !isOpen && isLoading,
    /** Error if the fetch failed */
    error,
    /** True if an allowlist is active but the data couldn't be loaded */
    dataUnavailable: !isOpen && !isLoading && !treeDump,
    /** Number of addresses in the allowlist */
    addressCount: addresses.length,
    /** All addresses in the allowlist */
    addresses,
    /** Raw tree dump for backup download */
    treeDump: treeDump ?? null,
    /** Check if an address is on the allowlist */
    checkAddress: (address: string): boolean => {
      if (isOpen) return true
      if (!treeDump) return false
      return isAllowlisted(treeDump, address)
    },
    /** Generate a Merkle proof for an address (null if not listed) */
    getProof: (address: string): string[] | null => {
      if (isOpen) return []
      if (!treeDump) return null
      return getAllowlistProof(treeDump, address)
    },
  }
}

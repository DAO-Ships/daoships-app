// ═══════════════════════════════════════════════════════════════════════════
// Allowlist Utilities — Merkle tree construction and proof generation
// ═══════════════════════════════════════════════════════════════════════════
//
// Uses OpenZeppelin's StandardMerkleTree which produces double-hashed leaves:
//   leaf = keccak256(abi.encode(keccak256(abi.encode(address))))
//
// This matches the on-chain MerkleProof.verify() in OnboarderNavigator and
// ERC20TributeNavigator contracts (updated to use StandardMerkleTree).
//
// Usage:
//   const tree = buildAllowlistTree(['0x00abc...', '0x00def...'])
//   const root = tree.root           // bytes32 hex string for deployment
//   const proof = getAllowlistProof(tree.dump(), '0x00abc...')
//   const listed = isAllowlisted(tree.dump(), '0x00abc...')
// ═══════════════════════════════════════════════════════════════════════════

import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { quais } from 'quais'
import { isValidCyprus1Address } from '@/services/utils/AddressUtils'

export const ZERO_BYTES32 = '0x' + '00'.repeat(32)

/**
 * Tree dump format — serializable JSON for storage and later proof generation.
 */
export type AllowlistTreeDump = ReturnType<StandardMerkleTree<[string]>['dump']>

/**
 * Parse a newline-separated string of addresses into a validated, deduplicated array.
 * Returns { addresses, invalid } where invalid contains lines that failed validation.
 */
export function parseAllowlistInput(raw: string): { addresses: string[]; invalid: string[] } {
  const lines = raw
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const seen = new Set<string>()
  const addresses: string[] = []
  const invalid: string[] = []

  for (const line of lines) {
    try {
      const checksummed = quais.getAddress(line)
      // This was the only address entry point in the app using bare getAddress
      // instead of the Cyprus-1 shard check every neighbouring field applies. An
      // address on the wrong shard would be baked into an IMMUTABLE allowlistRoot —
      // the navigator ABIs expose no setter — so the holder could never claim.
      if (!isValidCyprus1Address(checksummed)) {
        invalid.push(line)
        continue
      }
      const lower = checksummed.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        addresses.push(checksummed)
      }
    } catch {
      invalid.push(line)
    }
  }

  return { addresses, invalid }
}

/**
 * Build a StandardMerkleTree from an array of validated addresses.
 * Returns the tree instance (call .root for the bytes32 root, .dump() for serialization).
 *
 * @param addresses - Checksummed addresses (run through quais.getAddress first)
 * @returns StandardMerkleTree instance, or null if addresses is empty
 */
export function buildAllowlistTree(addresses: string[]): StandardMerkleTree<[string]> | null {
  if (addresses.length === 0) return null
  return StandardMerkleTree.of(
    addresses.map((a) => [a]),
    ['address'],
  )
}

/**
 * Generate a Merkle proof for a given address from a serialized tree dump.
 * Returns the proof array, or null if the address is not in the tree.
 *
 * @param treeDump - Output of tree.dump() (stored in Poster/IPFS)
 * @param address - The address to generate a proof for
 */
export function getAllowlistProof(treeDump: AllowlistTreeDump, address: string): string[] | null {
  try {
    const tree = StandardMerkleTree.load(treeDump)
    for (const [i, v] of tree.entries()) {
      if (v[0].toLowerCase() === address.toLowerCase()) {
        return tree.getProof(i)
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Check if an address is in a serialized allowlist tree.
 */
export function isAllowlisted(treeDump: AllowlistTreeDump, address: string): boolean {
  return getAllowlistProof(treeDump, address) !== null
}

/**
 * Verify that a tree dump produces the expected root.
 * Use this after fetching stored allowlist data to confirm integrity.
 */
export function verifyAllowlistRoot(treeDump: AllowlistTreeDump, expectedRoot: string): boolean {
  try {
    const tree = StandardMerkleTree.load(treeDump)
    return tree.root.toLowerCase() === expectedRoot.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Check if an allowlistRoot value represents "no allowlist" (open access).
 */
export function isOpenAllowlist(root: string | undefined | null): boolean {
  if (!root) return true
  return root === ZERO_BYTES32 || root === '0x0' || /^0x0+$/.test(root)
}

/**
 * Trigger a browser download of the allowlist tree dump as a JSON backup file.
 * This is a safety net — if the Poster transaction fails, the deployer
 * can recover the tree data from this local backup.
 */
export function downloadAllowlistBackup(
  navigatorAddress: string,
  root: string,
  addresses: string[],
  treeDump: unknown,
): void {
  const backup = {
    navigatorAddress,
    root,
    addresses,
    treeDump,
    exportedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `allowlist-${navigatorAddress.slice(0, 10)}-backup.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

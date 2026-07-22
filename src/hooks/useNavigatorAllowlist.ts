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
import { resolveUrl } from '@/utils/url'

// CID format: CIDv0 (Qm + 44 base58 chars) or CIDv1 (baf* prefix)
// Matches the indexer's CID_RE in handlers/poster.ts
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{51,63})$/

const IPFS_FETCH_TIMEOUT_MS = 10_000
const MAX_IPFS_ALLOWLIST_BYTES = 512 * 1024 // 512KB — ~5000 addresses

async function fetchIpfsAllowlist(cid: string): Promise<AllowlistTreeDump | null> {
  if (!CID_RE.test(cid)) {
    console.warn('[useNavigatorAllowlist] Invalid IPFS CID:', cid)
    return null
  }

  const url = resolveUrl(`ipfs://${cid}`)
  if (!url) return null

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IPFS_FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return null

    // Enforce the size limit BEFORE buffering. The content-length check is only a
    // fast path — a gateway may omit the header entirely, and the old fallback ran
    // `body.length > MAX` only AFTER response.text() had already buffered the whole
    // response into memory, which is exactly the case the limit exists to prevent.
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_IPFS_ALLOWLIST_BYTES) return null

    const body = await readCapped(response, MAX_IPFS_ALLOWLIST_BYTES)
    if (body === null) return null

    const parsed = JSON.parse(body)
    // The IPFS document should have the treeDump shape directly, or wrap it
    const dump = (parsed && typeof parsed === 'object' && 'tree' in parsed)
      ? (parsed as AllowlistTreeDump)
      : null
    return dump
  } catch (err) {
    console.warn('[useNavigatorAllowlist] IPFS fetch failed:', err)
    return null
  }
}

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

/**
 * Read a response body, aborting once `maxBytes` have been received.
 *
 * Returns null if the cap is exceeded — the caller treats that as "unusable", the same
 * as a malformed document. Falls back to text() only when the body is not streamable.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    return text.length > maxBytes ? null : text
  }

  const chunks: Uint8Array[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}


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

      // Two formats supported:
      //   1. Inline `treeDump` — small allowlists (<300 addresses) embedded in Poster content
      //   2. `ipfsCid` — large allowlists stored on IPFS, content is just the CID pointer
      let dump: AllowlistTreeDump | null = null
      const inlineDump = json.treeDump as AllowlistTreeDump | undefined
      if (inlineDump && typeof inlineDump === 'object') {
        dump = inlineDump
      } else if (typeof json.ipfsCid === 'string' && json.ipfsCid) {
        dump = await fetchIpfsAllowlist(json.ipfsCid)
      }

      if (!dump) return null

      // CRITICAL: Verify integrity — reconstructed Merkle root must match on-chain root.
      // This is the only defense against a malicious IPFS gateway serving modified data.
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

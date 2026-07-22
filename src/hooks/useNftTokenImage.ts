import { useQuery } from '@tanstack/react-query'
import { useProviderReady } from './useProviderReady'
import { navigatorService } from '@/services/core/NavigatorService'
import { resolveIpfsMedia } from '@/utils/url'

// ═══════════════════════════════════════════════════════════════════════════
// useNftTokenImage - resolve a claimed gate-NFT's image for the claimed-tokens gallery
// ───────────────────────────────────────────────────────────────────────────
// tokenURI(tokenId) → metadata JSON → image, all rendered through the public ipfs.io gateway.
// The gate collection is an untrusted external contract and metadata is arbitrary off-chain
// JSON, so every step is defensive: any failure (no provider, revert, CORS, bad JSON, missing
// image, disallowed scheme) resolves to null and the gallery falls back to the numeric badge.
// ═══════════════════════════════════════════════════════════════════════════

const META_FETCH_TIMEOUT_MS = 8000

/** Decode a `data:application/json[;base64],…` token URI (on-chain metadata) to an object. */
function parseDataJson(uri: string): unknown | null {
  const comma = uri.indexOf(',')
  if (comma < 0) return null
  const header = uri.slice(0, comma)
  const payload = uri.slice(comma + 1)
  try {
    const text = /;base64/i.test(header) ? atob(payload) : decodeURIComponent(payload)
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Pull a renderable image URL out of a token URI. Returns null if none can be resolved. */
async function fetchNftImageUrl(tokenUri: string): Promise<string | null> {
  let meta: unknown = null

  if (/^data:application\/json/i.test(tokenUri)) {
    meta = parseDataJson(tokenUri)
  } else {
    const metaUrl = resolveIpfsMedia(tokenUri)
    if (!metaUrl) return null
    try {
      const res = await fetch(metaUrl, { signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS) })
      if (!res.ok) return null
      meta = await res.json()
    } catch {
      return null
    }
  }

  if (!meta || typeof meta !== 'object') return null
  const record = meta as Record<string, unknown>
  const image = record.image ?? record.image_url ?? record.imageUrl
  if (typeof image !== 'string' || image.trim() === '') return null

  // On-chain SVGs/PNGs ship the image inline; data:image is safe in an <img src>.
  if (/^data:image\//i.test(image.trim())) return image.trim()
  return resolveIpfsMedia(image)
}

/**
 * Resolve the image URL for one claimed gate token. Lazy: callers should only mount this when
 * the gallery is expanded. Cached for 10 minutes; never retries (a missing image is a stable no).
 */
export function useNftTokenImage(gateToken: string | undefined, tokenId: string) {
  const providerReady = useProviderReady()
  return useQuery({
    queryKey: ['nftTokenImage', gateToken?.toLowerCase(), tokenId],
    queryFn: async (): Promise<string | null> => {
      const uri = await navigatorService.getErc721TokenURI(gateToken!, tokenId)
      if (!uri) return null
      return fetchNftImageUrl(uri)
    },
    enabled: !!gateToken && !!tokenId && providerReady,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

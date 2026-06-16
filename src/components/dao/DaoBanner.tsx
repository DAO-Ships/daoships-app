import { useState } from 'react'
import { resolveUrl, isValidUrl } from '@/utils/url'

// ═══════════════════════════════════════════════════════════════════════════
// DaoBanner - DAO profile banner image (content_json.banner).
//
// The URL is UNTRUSTED user-supplied content. Per FRONTEND_SECURITY_GUIDE §4 we
// validate the scheme before use (isValidUrl), resolve IPFS, never leak the page
// URL (referrerPolicy), never send credentials (crossOrigin), and fall back to
// nothing on error rather than retry-looping. Renders null when unset/invalid so
// DAOs without a banner get no layout change.
// ═══════════════════════════════════════════════════════════════════════════

interface DaoBannerProps {
  src?: string | null
  /** Alt text derived from the DAO name — never from the URL. */
  alt?: string
  className?: string
}

export function DaoBanner({ src, alt = '', className = '' }: DaoBannerProps) {
  const [imgError, setImgError] = useState(false)
  const resolvedSrc = src && isValidUrl(src) ? resolveUrl(src) : null

  if (!resolvedSrc || imgError) return null

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={`w-full h-32 sm:h-44 object-cover ${className}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setImgError(true)}
    />
  )
}

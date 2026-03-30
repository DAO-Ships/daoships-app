import { useState } from 'react'
import { resolveUrl, isValidUrl } from '@/utils/url'

// ═══════════════════════════════════════════════════════════════════════════
// DaoAvatar - DAO avatar image with fallback to DAOShips helm logo
// ═══════════════════════════════════════════════════════════════════════════

interface DaoAvatarProps {
  src?: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-full',
  lg: 'w-20 h-20 rounded-xl border-2',
} as const

export function DaoAvatar({ src, alt, size = 'md', className = '' }: DaoAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const resolvedSrc = src && isValidUrl(src) ? resolveUrl(src) : null
  const showImage = resolvedSrc && !imgError

  const sizeClass = SIZE_CLASSES[size]
  const baseClass = `${sizeClass} object-cover border-dao-border flex-shrink-0 ${className}`

  if (showImage) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        className={`${baseClass} border`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    )
  }

  return (
    <>
      <img
        src="/logos/dao_ships_helm_light_transparent.svg"
        alt={alt}
        className={`${baseClass} border dark:hidden`}
      />
      <img
        src="/logos/dao_ships_helm_dark_transparent.svg"
        alt={alt}
        className={`${baseClass} border hidden dark:block`}
      />
    </>
  )
}

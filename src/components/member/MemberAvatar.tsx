import { useState } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// MemberAvatar - Avatar image with person icon fallback
// ═══════════════════════════════════════════════════════════════════════════

interface MemberAvatarProps {
  avatar?: string
  /** Tailwind size number (6 = w-6 h-6 = 24px, 8 = 32px, 9 = 36px, 10 = 40px, 12 = 48px, 14 = 56px) */
  size?: 6 | 8 | 9 | 10 | 12 | 14
  className?: string
}

const SIZE_CLASSES = {
  6: 'w-6 h-6',
  8: 'w-8 h-8',
  9: 'w-9 h-9',
  10: 'w-10 h-10',
  12: 'w-12 h-12',
  14: 'w-14 h-14',
} as const

const ICON_SIZE_CLASSES = {
  6: 'w-3 h-3',
  8: 'w-4 h-4',
  9: 'w-[18px] h-[18px]',
  10: 'w-5 h-5',
  12: 'w-6 h-6',
  14: 'w-7 h-7',
} as const

export function MemberAvatar({ avatar, size = 8, className = '' }: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false)

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt=""
        className={`${SIZE_CLASSES[size]} rounded-full object-cover bg-dao-surface flex-shrink-0 ${className}`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    )
  }

  return (
    <div className={`${SIZE_CLASSES[size]} rounded-full bg-dao-surface flex items-center justify-center flex-shrink-0 ${className}`}>
      <svg
        className={`${ICON_SIZE_CLASSES[size]} text-dao-text-hint`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
    </div>
  )
}

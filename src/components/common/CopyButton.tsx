import { useState, useRef, useEffect } from 'react'
import { copyToClipboard } from '@/utils/clipboard'

// ═══════════════════════════════════════════════════════════════════════════
// CopyButton - Copy-to-clipboard button with "Copied!" feedback
// ═══════════════════════════════════════════════════════════════════════════

interface CopyButtonProps {
  text: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const COPY_FEEDBACK_MS = 2000

const sizeClasses: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

export function CopyButton({ text, className = '', size = 'md' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const handleCopy = async () => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 text-primary-500 hover:text-primary-400 transition-colors p-2 rounded hover:bg-dao-surface flex-shrink-0 ${className}`}
      title="Copy to clipboard"
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? (
        <>
          <svg aria-hidden="true" className={sizeClasses[size]} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs text-emerald-400" aria-live="polite">Copied!</span>
        </>
      ) : (
        <svg aria-hidden="true" className={sizeClasses[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  )
}

import { safeHref } from '@/utils/url'

// ═══════════════════════════════════════════════════════════════════════════
// SafeMarkdown - Safe rendering of untrusted user text with link auto-detection
// ═══════════════════════════════════════════════════════════════════════════

interface SafeMarkdownProps {
  children: string | null | undefined
  className?: string
}

/**
 * Renders untrusted user text with:
 * - Preserved whitespace and line breaks (via `whitespace-pre-wrap`)
 * - Auto-linked http/https URLs (sanitized via `safeHref`)
 * - React JSX auto-escaping for all other content (XSS-safe by default)
 *
 * NOT a full Markdown parser — this is a lightweight, safer alternative that
 * covers the common case of user-authored plain text with occasional links.
 */
export function SafeMarkdown({ children, className = '' }: SafeMarkdownProps) {
  if (!children) return null

  // Split by URL pattern. Using a capturing group keeps the URL tokens in the result.
  const urlRe = /(https?:\/\/[^\s]+)/g
  const parts = children.split(urlRe)

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, i) => {
        // Even indices are non-URL text; odd indices are URL matches.
        // Use a fresh regex (global regexes are stateful) to classify each part.
        if (/^https?:\/\/\S+$/.test(part)) {
          // The greedy URL match swallows trailing punctuation/brackets/quotes
          // (e.g. "(https://x.com)" or "see https://x.com."). Peel those off so they
          // render as text, not part of the link target.
          const trail = part.match(/[.,;:!?)\]}'"]+$/)?.[0] ?? ''
          const url = trail ? part.slice(0, -trail.length) : part
          const href = safeHref(url)
          if (href === '#') {
            return <span key={i}>{part}</span>
          }
          return (
            <span key={i}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary-400 hover:text-primary-300 underline"
              >
                {url}
              </a>
              {trail}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

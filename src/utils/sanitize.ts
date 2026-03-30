// ═══════════════════════════════════════════════════════════════════════════
// HTML Sanitization Utilities
// ═══════════════════════════════════════════════════════════════════════════

import DOMPurify from 'dompurify'

/**
 * Permitted HTML tags for rich-text display.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
  'a', 'img', 'ul', 'ol', 'li', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'sup', 'sub',
]

/**
 * Permitted attributes per tag.
 */
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class']

/**
 * Sanitize HTML, stripping dangerous tags and attributes while
 * preserving safe formatting markup.
 *
 * - Strips script, iframe, form, object, embed tags
 * - Strips event handler attributes (onerror, onclick, etc.)
 * - Strips javascript: and data: URLs from hrefs
 * - Adds target="_blank" rel="noopener noreferrer" to links
 * - Allows https and ipfs img src
 *
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ipfs):\/\/)/i,
  })

  // Post-process: add target and rel to all links
  const div = document.createElement('div')
  div.innerHTML = clean

  div.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') || ''
    // Strip javascript: and data: schemes
    if (/^\s*(javascript|data|vbscript|blob):/i.test(href)) {
      anchor.removeAttribute('href')
      anchor.setAttribute('href', '#')
    }
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer nofollow')
  })

  // Validate img src - only allow https and ipfs
  div.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (!/^\s*(https?:|ipfs:)/i.test(src)) {
      img.removeAttribute('src')
    }
  })

  return div.innerHTML
}

/**
 * Strip all HTML tags, returning plain text.
 *
 * @param html - HTML string to strip
 * @returns Plain text
 */
export function stripHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
  // DOMPurify with no allowed tags returns text content
  return clean
}

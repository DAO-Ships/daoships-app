// ═══════════════════════════════════════════════════════════════════════════
// URL Validation & Resolution Utilities
// ═══════════════════════════════════════════════════════════════════════════

import type { Untrusted } from '@/types/untrusted'

/**
 * Default IPFS gateway for resolving ipfs:// URIs.
 * Configurable via VITE_IPFS_GATEWAY environment variable.
 * Accepts either `https://gateway.example.com/ipfs/` (with path) or
 * `https://gateway.example.com` (bare host — we'll append `/ipfs/`).
 */
const RAW_IPFS_GATEWAY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_IPFS_GATEWAY) || 'https://gateway.pinata.cloud/ipfs/'
const IPFS_GATEWAY = /\/ipfs\/?$/.test(RAW_IPFS_GATEWAY)
  ? RAW_IPFS_GATEWAY.replace(/\/?$/, '/')
  : `${RAW_IPFS_GATEWAY.replace(/\/$/, '')}/ipfs/`

/**
 * Positive allowlist: only these schemes are permitted.
 */
const SAFE_SCHEME = /^(https?|ipfs):\/\//i

/**
 * IPFS CID format: CIDv0 (Qm + 44 base58) or CIDv1 (bafy + base32).
 * Allows subdirectory paths after the CID but blocks traversal.
 */
const VALID_CID = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/

/**
 * Check whether a string is a safe URL (http, https, or ipfs scheme).
 *
 * @param url - The URL string to validate
 * @returns true if the URL uses an allowed scheme
 */
export function isValidUrl(url: Untrusted<string> | string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed === '') return false
  return SAFE_SCHEME.test(trimmed)
}

/**
 * Resolve a URL for safe rendering. Converts ipfs:// to gateway URL.
 * Returns null for invalid or dangerous URLs.
 *
 * @param url - URL string, potentially ipfs://
 * @returns Resolved URL string, or null if invalid
 */
export function resolveUrl(url: Untrusted<string> | string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed === '') return null
  if (!isValidUrl(trimmed)) return null

  if (/^ipfs:\/\//i.test(trimmed)) {
    const cid = trimmed.replace(/^ipfs:\/\//i, '')
    // Validate CID format
    if (!cid || !VALID_CID.test(cid)) return null
    // Block path traversal (raw and URL-encoded)
    if (/\.\.|%2e/i.test(cid)) return null
    return `${IPFS_GATEWAY}${encodeURI(cid)}`
  }

  return trimmed
}

/**
 * Return a safe href for use in anchor tags.
 * Uses a positive allowlist — only http, https, and ipfs URLs pass.
 * Returns '#' for everything else (mailto:, ftp:, tel:, javascript:, data:, etc.).
 *
 * @param url - URL string to check
 * @returns The resolved URL if safe, '#' otherwise
 */
export function safeHref(url: string | null | undefined): string {
  return resolveUrl(url) ?? '#'
}

/** Public ipfs.io gateway used for rendering NFT media (metadata + images). */
const IPFS_IO_GATEWAY = 'https://ipfs.io/ipfs/'

/**
 * Resolve an NFT media/metadata URI to an https URL via the public ipfs.io gateway.
 * - `ipfs://<cid>[/path]` and `ipfs://ipfs/<cid>` → `https://ipfs.io/ipfs/<cid>[/path]`
 * - `http(s)://…` → passed through unchanged (already fetchable)
 * Returns null for anything else (data:, javascript:, empty, malformed CID, traversal).
 * Use this instead of resolveUrl() when you specifically want the ipfs.io gateway.
 */
export function resolveIpfsMedia(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed === '') return null

  if (/^ipfs:\/\//i.test(trimmed)) {
    // Accept both `ipfs://<cid>` and the redundant `ipfs://ipfs/<cid>` form.
    const cid = trimmed.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '')
    if (!cid || !VALID_CID.test(cid)) return null
    if (/\.\.|%2e/i.test(cid)) return null // block path traversal (raw + encoded)
    return `${IPFS_IO_GATEWAY}${encodeURI(cid)}`
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed

  return null
}

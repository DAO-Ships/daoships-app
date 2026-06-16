import type { Dao, DaoRecord, TrustLevel } from '@/types'
import { TRUST_LEVEL_CONFIG } from '@/types'
import { isValidUrl, safeHref } from '@/utils/url'
import { DaoAvatar } from './DaoAvatar'
import { safeString, safeEntries } from '@/utils/contentJson'
import { NETWORK_CONFIG } from '@/config/contracts'
import { TrustBadge } from '@/components/common/TrustBadge'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'

// ═══════════════════════════════════════════════════════════════════════════
// DaoProfile - DAO identity: name, description, avatar, links, trust, tags
// ═══════════════════════════════════════════════════════════════════════════

/** Known link types with icons (SVG paths for 16x16 viewBox) */
const LINK_ICONS: Record<string, { label: string; icon: string }> = {
  website: {
    label: 'Website',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  },
  discord: {
    label: 'Discord',
    icon: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z',
  },
  twitter: {
    label: 'X / Twitter',
    icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  github: {
    label: 'GitHub',
    icon: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z',
  },
  telegram: {
    label: 'Telegram',
    icon: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
  docs: {
    label: 'Docs',
    icon: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zM13 9V3.5L18.5 9H13z',
  },
  forum: {
    label: 'Forum',
    icon: 'M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z',
  },
}

/** Sanitize a link key for safe display. Strip non-alphanumeric/hyphen/underscore. */
function sanitizeLinkKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)
}

interface DaoProfileProps {
  dao: Dao
  profile?: DaoRecord | null
  /** Whether the connected user is an active member (pass from parent to avoid duplicate query) */
  isMember?: boolean
}

export function DaoProfile({ dao, profile, isMember = false }: DaoProfileProps) {

  // Use indexer-validated content_json (not raw content string)
  const profileContent = (profile?.content_json as Record<string, unknown> | null) ?? null

  const name = dao.name || safeString(profileContent, 'name') || `DAO ${dao.id.slice(0, 8)}...`
  const description = dao.description || safeString(profileContent, 'description') || null
  const rawAvatarUrl = dao.avatar_img || safeString(profileContent, 'avatar') || null

  // Extract links from content_json (validate type and each URL)
  const rawLinks = profileContent && typeof profileContent === 'object'
    ? (profileContent as Record<string, unknown>).links
    : null
  const links: Array<{ key: string; label: string; url: string; icon: string | null }> = []
  if (rawLinks && typeof rawLinks === 'object' && !Array.isArray(rawLinks)) {
    for (const [key, value] of safeEntries(rawLinks as Record<string, unknown>)) {
      if (typeof value !== 'string' || !isValidUrl(value)) continue
      const cleanKey = sanitizeLinkKey(key)
      if (!cleanKey) continue
      const known = LINK_ICONS[cleanKey.toLowerCase()]
      links.push({
        key: cleanKey,
        label: known?.label || cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1),
        url: value,
        icon: known?.icon || null,
      })
      if (links.length >= 20) break
    }
  }

  // Extract tags from content_json
  const rawTags = profileContent && typeof profileContent === 'object'
    ? (profileContent as Record<string, unknown>).tags
    : null
  const tags: string[] = []
  if (Array.isArray(rawTags)) {
    for (const tag of rawTags) {
      if (typeof tag === 'string' && tag.trim()) {
        tags.push(tag.trim().slice(0, 60))
        if (tags.length >= 10) break
      }
    }
  }

  // Trust level — use the indexed trust_level if available, fall back to profile_source
  const trustLevel: TrustLevel | null = profile?.trust_level
    ? (profile.trust_level as TrustLevel)
    : dao.profile_source === 'vault'
      ? 'VERIFIED'
      : dao.profile_source === 'launcher'
        ? 'VERIFIED_INITIAL'
        : null

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-4">
      {/* Main profile row */}
      <div className="flex flex-col sm:flex-row items-start gap-5 sm:gap-6">
        {/* Avatar */}
        <div className="ring-2 ring-primary-500/30 shadow-indigo-glow rounded-xl flex-shrink-0">
          <DaoAvatar src={rawAvatarUrl} alt={name} size="lg" />
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-dao-text">
              {name}
            </h1>
            {trustLevel && TRUST_LEVEL_CONFIG[trustLevel] && (
              <TrustBadge level={trustLevel} size="sm" />
            )}
            {isMember && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-700/50">
                <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Member
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-dao-text-hint font-mono mb-3">
            <AddressDisplay address={dao.id} />
            {dao.avatar && (
              <span>
                Treasury:{' '}
                <a
                  href={`${NETWORK_CONFIG.quaiVaultUrl}/wallet/${dao.avatar}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-accent-400 hover:text-accent-300 transition-colors"
                >
                  {dao.avatar.slice(0, 6)}...{dao.avatar.slice(-4)}
                </a>
              </span>
            )}
          </div>
          {description && (
            <p className="text-sm text-dao-text-muted leading-relaxed max-w-2xl">
              <SafeMarkdown>{description}</SafeMarkdown>
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-dao-dark-3 text-dao-text-secondary border border-dao-border"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Links */}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {links.map(({ key, label, url, icon }) => (
            <a
              key={key}
              href={safeHref(url)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dao-dark-3 border border-dao-border text-sm text-dao-text-secondary hover:text-dao-text hover:border-accent-500/50 transition-colors"
              title={url}
            >
              {icon ? (
                <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d={icon} />
                </svg>
              ) : (
                <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              )}
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

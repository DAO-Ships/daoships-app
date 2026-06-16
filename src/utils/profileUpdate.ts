import type { DaoTheme } from '@/utils/daoTheme'

// ═══════════════════════════════════════════════════════════════════════════
// buildProfileUpdate — turns (current, next) DAO profile fields into the partial
// payload for a `daoships.dao.profile` Poster post. Returns null when nothing
// changed.
//
// name/description/avatar are merged by the indexer into ds_daos columns, so a
// plain diff is enough. banner/theme live ONLY in ds_records.content_json and
// getDaoProfile reads the latest record — so they must be re-sent or they vanish:
// carry them forward when unchanged, and send `null` (the indexer's "remove"
// sentinel) when the user cleared them. Without the explicit clear, clearing a
// banner/theme as the only change produced an empty payload — which made the
// caller report "no changes" and never open the confirm dialog / wallet.
// ═══════════════════════════════════════════════════════════════════════════

export interface ProfileFields {
  name?: string
  description?: string
  avatar?: string
  banner?: string
  theme?: DaoTheme
  links?: Record<string, string>
  tags?: string[]
}

export function buildProfileUpdate(
  daoAddress: string,
  cur: ProfileFields,
  next: ProfileFields,
): Record<string, unknown> | null {
  const update: Record<string, unknown> = { daoAddress }

  // Merged ds_daos columns — plain diff.
  if ((next.name || '') !== (cur.name || '')) update.name = next.name
  if ((next.description || '') !== (cur.description || '')) update.description = next.description
  if ((next.avatar || '') !== (cur.avatar || '')) update.avatar = next.avatar

  // content_json-only — carry forward when unchanged, null to clear when removed.
  const curBanner = cur.banner || ''
  const nextBanner = next.banner || ''
  if (nextBanner !== curBanner) update.banner = nextBanner || null
  else if (nextBanner) update.banner = nextBanner

  const nextTheme = next.theme && Object.keys(next.theme).length > 0 ? next.theme : undefined
  const themeChanged = JSON.stringify(next.theme || {}) !== JSON.stringify(cur.theme || {})
  if (themeChanged) update.theme = nextTheme ?? null
  else if (nextTheme) update.theme = nextTheme

  if (JSON.stringify(next.links || {}) !== JSON.stringify(cur.links || {})) update.links = next.links
  if (JSON.stringify(next.tags || []) !== JSON.stringify(cur.tags || [])) update.tags = next.tags

  const changedKeys = Object.keys(update).filter((k) => k !== 'daoAddress')
  return changedKeys.length > 0 ? update : null
}

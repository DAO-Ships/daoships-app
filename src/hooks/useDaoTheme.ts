import { useEffect } from 'react'
import { useUiStore } from '@/store/uiStore'
import { extractTheme, buildThemeVars, type DaoTheme } from '@/utils/daoTheme'
import type { DaoRecord } from '@/types/record'

/**
 * Applies a DAO's posted color scheme to the whole UI while a DAO route is
 * mounted, then reverts on unmount/route-change. Sets validated, contrast-guarded
 * CSS variables on <html> (overriding the index.css defaults); cleanup removes
 * them so the app palette restores automatically.
 *
 * Mode is intentionally ignored — the user's global light/dark choice wins; only
 * the DAO's colors are applied. Re-applies on light/dark toggle so surface
 * derivation steps the correct direction.
 */
export function useDaoTheme(profile: DaoRecord | null | undefined) {
  const themeChoice = useUiStore((s) => s.theme)
  // Serialize the re-validated theme so the effect only depends on its content
  // (stable across refetches that don't change the palette).
  const themeJson = JSON.stringify(
    extractTheme(profile?.content_json as Record<string, unknown> | null | undefined) ?? null,
  )

  useEffect(() => {
    const theme = JSON.parse(themeJson) as DaoTheme | null
    if (!theme) return

    const root = document.documentElement
    const isDark = root.classList.contains('dark')
    const vars = buildThemeVars(theme, isDark)
    const keys = Object.keys(vars)
    if (keys.length === 0) return

    for (const k of keys) root.style.setProperty(k, vars[k])
    return () => {
      for (const k of keys) root.style.removeProperty(k)
    }
  }, [themeJson, themeChoice])
}

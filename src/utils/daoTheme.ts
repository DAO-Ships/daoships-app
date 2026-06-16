// ═══════════════════════════════════════════════════════════════════════════
// daoTheme — turns a DAO's posted `content_json.theme` palette into the CSS
// custom properties the app actually reads (--primary-*, --accent-*, --dao-*).
//
// SECURITY: the indexer already gates `theme` to strict hex + mode literals
// (FRONTEND_SECURITY_GUIDE §2), but per §5 the frontend must NOT trust
// content_json blindly. So extractTheme() RE-VALIDATES every token against the
// same hex regex before anything reaches CSS, and buildThemeVars() applies WCAG
// contrast guards, dropping any token (or the whole bg/text pair) that would
// render the UI illegible — falling back to the app defaults instead.
// ═══════════════════════════════════════════════════════════════════════════

// Mirrors the indexer's gate exactly (poster.ts HEX_COLOR_RE).
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/

const THEME_COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'surface', 'text'] as const
type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]

export interface DaoTheme {
  mode?: 'light' | 'dark'
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  surface?: string
  text?: string
}

type RGB = [number, number, number]
const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]
const AA = 4.5

/** Parse a strict-hex string (#rgb or #rrggbb) to RGB, or null if malformed. */
export function parseHex(hex: string): RGB | null {
  if (!HEX_RE.test(hex)) return null
  let h = hex.slice(1)
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
const mix = (a: RGB, b: RGB, t: number): RGB => [
  clamp(a[0] + (b[0] - a[0]) * t),
  clamp(a[1] + (b[1] - a[1]) * t),
  clamp(a[2] + (b[2] - a[2]) * t),
]
const rgbTriple = (c: RGB) => `${c[0]} ${c[1]} ${c[2]}`
const rgbToHex = (c: RGB) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('')

function relLuminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(a: RGB, b: RGB): number {
  const la = relLuminance(a)
  const lb = relLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// 11-step tint/shade ramp from a single base hex: mix toward white above 500,
// toward black below. Predictable for any input; the default ramps in index.css
// are the hand-tuned ones (this only drives themed DAOs).
const RAMP: Array<[number, RGB, number]> = [
  [50, WHITE, 0.92], [100, WHITE, 0.84], [200, WHITE, 0.7], [300, WHITE, 0.52], [400, WHITE, 0.28],
  [500, WHITE, 0], [600, BLACK, 0.16], [700, BLACK, 0.32], [800, BLACK, 0.48], [900, BLACK, 0.62], [950, BLACK, 0.78],
]

export function generateRamp(base: RGB): Record<number, RGB> {
  const out: Record<number, RGB> = {}
  for (const [stop, dir, t] of RAMP) out[stop] = t === 0 ? base : mix(base, dir, t)
  return out
}

/** Mix `text` toward `bg` by up to `t`, backing off until contrast ≥ minRatio. */
function fadeToward(text: RGB, bg: RGB, t: number, minRatio: number): RGB {
  let f = t
  let c = mix(text, bg, f)
  while (f > 0 && contrast(c, bg) < minRatio) {
    f = Math.max(0, f - 0.05)
    c = mix(text, bg, f)
  }
  return c
}

/**
 * Re-validate a raw content_json.theme into a DaoTheme with ONLY strict-hex
 * colors and a literal mode. Returns null when nothing usable survives.
 */
export function extractTheme(content: Record<string, unknown> | null | undefined): DaoTheme | null {
  if (!content || typeof content !== 'object') return null
  const raw = content.theme
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const theme: DaoTheme = {}
  if (obj.mode === 'light' || obj.mode === 'dark') theme.mode = obj.mode
  for (const key of THEME_COLOR_KEYS) {
    const v = obj[key]
    if (typeof v === 'string' && HEX_RE.test(v)) theme[key as ThemeColorKey] = v
  }
  const hasColor = THEME_COLOR_KEYS.some((k) => theme[k])
  return hasColor ? theme : null
}

/**
 * Build the CSS-variable map to apply on <html> for a validated theme.
 * - primary/accent → full ramps (primary gated on white-on-600 ≥ AA for buttons).
 * - background+text → applied as a pair ONLY when they pass AA; surfaces/borders
 *   and faded text tokens are derived from that legible pair (and re-checked).
 * `isDark` decides which way surfaces step (lighter in dark, darker in light).
 */
export function buildThemeVars(theme: DaoTheme, isDark: boolean): Record<string, string> {
  const vars: Record<string, string> = {}

  const primary = theme.primary ? parseHex(theme.primary) : null
  if (primary) {
    const ramp = generateRamp(primary)
    // btn-primary is white text on primary-600 — only apply if it stays legible.
    if (contrast(WHITE, ramp[600]) >= AA) {
      for (const stop of Object.keys(ramp)) vars[`--primary-${stop}`] = rgbTriple(ramp[Number(stop)])
    }
  }

  const accent = theme.accent ? parseHex(theme.accent) : null
  if (accent) {
    const ramp = generateRamp(accent)
    for (const stop of Object.keys(ramp)) vars[`--accent-${stop}`] = rgbTriple(ramp[Number(stop)])
  }

  const bg = theme.background ? parseHex(theme.background) : null
  const text = theme.text ? parseHex(theme.text) : null
  if (bg && text && contrast(text, bg) >= AA) {
    const dir = isDark ? WHITE : BLACK
    const surface = (theme.surface && parseHex(theme.surface)) || mix(bg, dir, 0.16)
    vars['--dao-bg-1'] = rgbToHex(bg)
    vars['--dao-bg-2'] = rgbToHex(mix(bg, dir, 0.04))
    vars['--dao-bg-3'] = rgbToHex(mix(bg, dir, 0.08))
    vars['--dao-bg-4'] = rgbToHex(mix(bg, dir, 0.13))
    vars['--dao-surface'] = rgbToHex(surface)
    vars['--dao-border'] = rgbToHex(mix(bg, dir, 0.26))
    vars['--dao-text'] = rgbToHex(text)
    vars['--dao-text-secondary'] = rgbToHex(fadeToward(text, bg, 0.18, AA))
    vars['--dao-text-muted'] = rgbToHex(fadeToward(text, bg, 0.36, AA))
    vars['--dao-text-hint'] = rgbToHex(fadeToward(text, bg, 0.5, AA))
  }

  return vars
}

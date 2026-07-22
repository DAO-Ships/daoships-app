import type { DaoTheme } from '@/utils/daoTheme'

// ═══════════════════════════════════════════════════════════════════════════
// DaoThemeEditor - picks a DAO color scheme (content_json.theme). Shared by the
// governance ProfileForm and the launch BasicInfoStep.
//
// Uses native <input type="color"> which only ever emits strict #rrggbb, so the
// output mirrors the indexer's hex gate by construction — a posted theme can't be
// silently dropped. Each token is opt-in (a DAO can theme just `primary`, or all
// six). Output is a DaoTheme containing only the enabled keys (+ optional mode).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Colour-valued theme keys. Excludes `mode`, which is a 'light' | 'dark' union
 * handled by setMode() — without this, generic key assignment in toggle()/setColor()
 * is unsound for that field.
 */
type DaoThemeColorKey = Exclude<keyof DaoTheme, 'mode'>

const COLOR_FIELDS: Array<{ key: DaoThemeColorKey; label: string; fallback: string }> = [
  { key: 'primary', label: 'Primary', fallback: '#6257c9' },
  { key: 'accent', label: 'Accent', fallback: '#06b6d4' },
  { key: 'background', label: 'Background', fallback: '#0a0a12' },
  { key: 'surface', label: 'Surface', fallback: '#252540' },
  { key: 'text', label: 'Text', fallback: '#f3f4f6' },
  { key: 'secondary', label: 'Secondary text', fallback: '#d1d5db' },
]

/** Expand #rgb → #rrggbb so it's valid for <input type="color">. */
function toColorInputValue(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) return '#' + hex.slice(1).split('').map((c) => c + c).join('')
  return fallback
}

interface DaoThemeEditorProps {
  value: DaoTheme
  onChange: (theme: DaoTheme) => void
  disabled?: boolean
}

export function DaoThemeEditor({ value, onChange, disabled = false }: DaoThemeEditorProps) {
  const toggle = (key: DaoThemeColorKey, fallback: string, on: boolean) => {
    const next = { ...value }
    if (on) next[key] = next[key] ?? fallback
    else delete next[key]
    onChange(next)
  }
  const setColor = (key: DaoThemeColorKey, hex: string) => onChange({ ...value, [key]: hex })
  const setMode = (m: string) => {
    const next = { ...value }
    if (m === 'light' || m === 'dark') next.mode = m
    else delete next.mode
    onChange(next)
  }

  const pv = (k: keyof DaoTheme, fb: string) => toColorInputValue(value[k] as string | undefined, fb)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {COLOR_FIELDS.map(({ key, label, fallback }) => {
          const enabled = value[key] !== undefined
          return (
            <div key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`theme-${key}`}
                checked={enabled}
                onChange={(e) => toggle(key, fallback, e.target.checked)}
                disabled={disabled}
                className="h-4 w-4 rounded border-dao-border accent-primary-600"
              />
              <label htmlFor={`theme-${key}`} className="flex-1 text-sm text-dao-text-secondary">{label}</label>
              <input
                type="color"
                aria-label={`${label} color`}
                value={pv(key, fallback)}
                onChange={(e) => setColor(key, e.target.value)}
                disabled={disabled || !enabled}
                className="h-8 w-12 cursor-pointer rounded border border-dao-border bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span className="w-20 font-mono text-2xs text-dao-text-hint">{enabled ? value[key] : '—'}</span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="theme-mode" className="text-sm text-dao-text-secondary">Preferred mode</label>
        <select
          id="theme-mode"
          value={value.mode ?? ''}
          onChange={(e) => setMode(e.target.value)}
          disabled={disabled}
          className="input text-sm py-1"
        >
          <option value="">No preference</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <span className="text-2xs text-dao-text-hint">(colors apply; viewers keep their own light/dark)</span>
      </div>

      {/* Live preview */}
      <div
        className="rounded-lg border p-4"
        style={{
          background: value.background ?? 'var(--dao-bg-2)',
          borderColor: value.surface ?? 'var(--dao-border)',
          color: value.text ?? 'var(--dao-text)',
        }}
      >
        <p className="text-sm font-semibold" style={{ color: value.text ?? 'var(--dao-text)' }}>Preview</p>
        <p className="text-xs" style={{ color: value.secondary ?? 'var(--dao-text-secondary)' }}>
          This is how your DAO's colors look together.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span
            className="rounded-md px-3 py-1 text-xs font-medium text-white"
            style={{ background: value.primary ?? 'var(--dao-bg-4)' }}
          >
            Primary
          </span>
          <span
            className="rounded-md px-3 py-1 text-xs font-medium"
            style={{ background: value.surface ?? 'var(--dao-surface)', color: value.accent ?? 'var(--dao-text)' }}
          >
            Accent
          </span>
        </div>
      </div>

      <p className="text-xs text-dao-text-hint">
        Colors are validated and contrast-checked before they apply — an unreadable pair falls back to the
        default palette.
      </p>
    </div>
  )
}

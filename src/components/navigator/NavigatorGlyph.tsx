import { getNavigatorIcon } from '@/config/navigatorCatalog'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorGlyph — a navigator's outline icon inside a branded "compass dial"
// frame (a dashed ring + four cardinal ticks drawn from the DAOShips helm logo).
// Gives every navigator surface (card / catalog / detail hero) one cohesive,
// on-brand treatment instead of a plain coloured box. The dial motif is faint
// and aria-hidden — ambient identity, not decoration that competes with the glyph.
// ═══════════════════════════════════════════════════════════════════════════

type Tone = 'accent' | 'primary'
type Size = 'sm' | 'lg'

interface NavigatorGlyphProps {
  /** Navigator type string (resolved via getNavigatorIcon). */
  type?: string
  /** Explicit icon path, overrides `type` lookup (used by the catalog). */
  iconPath?: string
  size?: Size
  tone?: Tone
  className?: string
}

const SIZE: Record<Size, { box: string; glyph: string }> = {
  sm: { box: 'w-10 h-10 rounded-lg', glyph: 'w-5 h-5' },
  lg: { box: 'w-12 h-12 sm:w-14 sm:h-14 rounded-xl', glyph: 'w-7 h-7' },
}

const TONE: Record<Tone, { box: string; text: string }> = {
  accent: { box: 'bg-accent-500/10 border border-accent-500/20', text: 'text-accent-400' },
  primary: { box: 'bg-primary-500/10 border border-primary-500/20', text: 'text-primary-400' },
}

export function NavigatorGlyph({ type, iconPath, size = 'sm', tone = 'accent', className = '' }: NavigatorGlyphProps) {
  const path = iconPath ?? getNavigatorIcon(type ?? '')
  const s = SIZE[size]
  const t = TONE[tone]

  return (
    <div className={`relative flex items-center justify-center flex-shrink-0 ${s.box} ${t.box} ${className}`}>
      {/* Compass-dial motif (from the helm logo): dashed bezel + cardinal ticks. */}
      <svg aria-hidden="true" className={`absolute inset-0 h-full w-full ${t.text}`} viewBox="0 0 100 100" fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="44" strokeWidth="1.5" strokeDasharray="3 7" opacity="0.3" />
        <g strokeWidth="3" strokeLinecap="round" opacity="0.45">
          <line x1="50" y1="7" x2="50" y2="14" />
          <line x1="93" y1="50" x2="86" y2="50" />
          <line x1="50" y1="93" x2="50" y2="86" />
          <line x1="7" y1="50" x2="14" y2="50" />
        </g>
      </svg>
      {/* The navigator glyph. */}
      <svg aria-hidden="true" className={`relative ${s.glyph} ${t.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// BrandPattern — an ambient, monochrome slice of the DAOShips helm logo
// (dashed compass rings + an octagonal node-graph + a hex core). Renders in
// `currentColor`, so the caller controls hue + opacity via a text-color class
// (e.g. `text-primary-500/[0.06]`) and position via absolute classes. Purely
// decorative: aria-hidden, pointer-events-none. Keep it faint and off to an
// edge — felt, not seen.
// ═══════════════════════════════════════════════════════════════════════════

// 8 waypoint nodes on a radius-78 ring around center (100,100).
const NODES: Array<[number, number]> = [
  [100, 22], [155.2, 44.8], [178, 100], [155.2, 155.2],
  [100, 178], [44.8, 155.2], [22, 100], [44.8, 44.8],
]
const OCTAGON = NODES.map(([x, y]) => `${x},${y}`).join(' ')
const HEX = '100,82 115.6,91 115.6,109 100,118 84.4,109 84.4,91'

export function BrandPattern({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      className={`pointer-events-none select-none ${className}`}
    >
      {/* compass rings */}
      <circle cx="100" cy="100" r="92" strokeWidth="1" strokeDasharray="2 7" />
      <circle cx="100" cy="100" r="80" strokeWidth="1.25" />
      {/* node-graph: octagon perimeter + crossing chords */}
      <polygon points={OCTAGON} strokeWidth="1.25" />
      <g strokeWidth="1">
        <line x1="100" y1="22" x2="100" y2="178" />
        <line x1="22" y1="100" x2="178" y2="100" />
        <line x1="155.2" y1="44.8" x2="44.8" y2="155.2" />
        <line x1="44.8" y1="44.8" x2="155.2" y2="155.2" />
      </g>
      {/* waypoint node dots */}
      <g fill="currentColor" stroke="none">
        {NODES.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" />
        ))}
      </g>
      {/* hex core */}
      <polygon points={HEX} strokeWidth="1.25" />
      <circle cx="100" cy="100" r="6" fill="currentColor" stroke="none" />
    </svg>
  )
}

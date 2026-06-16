// ═══════════════════════════════════════════════════════════════════════════
// StatusDot - Green / yellow / red / gray dot for status indication
// ═══════════════════════════════════════════════════════════════════════════

type StatusLevel = 'healthy' | 'warning' | 'error' | 'unknown'

interface StatusDotProps {
  status: StatusLevel
  className?: string
  label?: string
}

const dotColors: Record<StatusLevel, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  unknown: 'bg-gray-500',
}

const pulseColors: Record<StatusLevel, string> = {
  healthy: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  unknown: 'bg-gray-400',
}

const statusText: Record<StatusLevel, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  error: 'Error',
  unknown: 'Unknown',
}

export function StatusDot({ status, className = '', label }: StatusDotProps) {
  // Status is color-only; give assistive tech a textual name. When a visible label exists
  // it already names the control, so only add an aria-label for the bare-dot case.
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      {...(label ? {} : { role: 'img', 'aria-label': statusText[status] })}
    >
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        {status !== 'unknown' && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulseColors[status]}`}
          />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColors[status]}`}
        />
      </span>
      {label && <span className="text-sm text-dao-text-secondary">{label}</span>}
    </span>
  )
}

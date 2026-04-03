// ═══════════════════════════════════════════════════════════════════════════
// ErrorBanner — Consistent error display component
// ═══════════════════════════════════════════════════════════════════════════

interface ErrorBannerProps {
  message: string
  className?: string
}

export function ErrorBanner({ message, className = '' }: ErrorBannerProps) {
  return (
    <div className={`bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 ${className}`}>
      <p className="text-sm text-red-400">{message}</p>
    </div>
  )
}

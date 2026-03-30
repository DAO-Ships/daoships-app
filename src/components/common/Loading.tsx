// ═══════════════════════════════════════════════════════════════════════════
// Loading - Animated spinner with inline and full-page modes
// ═══════════════════════════════════════════════════════════════════════════

type LoadingSize = 'sm' | 'md' | 'lg'

interface LoadingProps {
  size?: LoadingSize
  className?: string
  fullPage?: boolean
}

const sizeClasses: Record<LoadingSize, string> = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
}

export function Loading({ size = 'md', className = '', fullPage = false }: LoadingProps) {
  const spinner = (
    <div
      className={`animate-spin rounded-full border-solid border-primary-500 border-r-transparent ${sizeClasses[size]} ${className}`}
    />
  )

  if (fullPage) {
    return (
      <div className="flex items-center justify-center h-full w-full min-h-[200px]">
        {spinner}
      </div>
    )
  }

  return spinner
}

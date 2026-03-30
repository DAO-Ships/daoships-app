import { Component, type ReactNode, type ErrorInfo } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// ErrorBoundary - React error boundary (class component)
// ═══════════════════════════════════════════════════════════════════════════

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  private handleRefresh = () => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <div className="card max-w-lg w-full p-8 text-center">
            {/* Error icon */}
            <div className="mx-auto mb-6 flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 border-2 border-red-400 dark:border-red-600">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-dao-text mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-dao-text-muted mb-6">
              An unexpected error occurred. Please refresh the page to try again.
            </p>

            {/* Error details (collapsed) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-dao-text-hint hover:text-dao-text transition-colors">
                  Show error details
                </summary>
                <pre className="mt-2 p-3 bg-dao-dark-1 rounded-lg text-xs text-red-300 overflow-x-auto whitespace-pre-wrap break-words">
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}

            <button onClick={this.handleRefresh} className="btn-primary">
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

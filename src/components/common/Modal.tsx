import { useEffect, useCallback, useRef, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// Modal - Overlay dialog with backdrop, escape-key dismiss & focus trap
// ═══════════════════════════════════════════════════════════════════════════

type ModalSize = 'sm' | 'md' | 'lg'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  size?: ModalSize
  /** When true, Escape key and backdrop click are suppressed (e.g. during a pending transaction). */
  preventClose?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  size = 'md',
  preventClose = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose()
        return
      }

      // Focus trap: cycle Tab within the modal
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onClose, preventClose],
  )

  useEffect(() => {
    if (!isOpen) return

    // Remember what was focused before the modal opened
    previousFocusRef.current = document.activeElement as HTMLElement | null

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    // Focus first focusable element inside the modal
    requestAnimationFrame(() => {
      if (dialogRef.current) {
        const first = dialogRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        first?.focus()
      }
    })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      // Restore focus on close
      previousFocusRef.current?.focus()
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={preventClose ? undefined : onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={`relative w-full ${sizeClasses[size]} mx-4 max-h-[90vh] max-h-[90dvh] overflow-y-auto bg-dao-dark-3 border border-dao-border rounded-xl shadow-2xl ${className}`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-dao-border">
            <h2 id="modal-title" className="text-lg font-semibold text-dao-text">{title}</h2>
            <button
              onClick={preventClose ? undefined : onClose}
              className="text-dao-text-muted hover:text-dao-text transition-colors p-1 rounded hover:bg-dao-surface"
              aria-label="Close"
              disabled={preventClose}
            >
              <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-4 sm:px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}

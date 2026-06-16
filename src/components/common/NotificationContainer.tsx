import { useState, useEffect, useCallback } from 'react'
import { notificationManager, type Notification } from '@/services/utils/NotificationManager'

// ═══════════════════════════════════════════════════════════════════════════
// NotificationContainer - Toast notifications (fixed, top-right)
// ═══════════════════════════════════════════════════════════════════════════

// Canonical semantic palette (success=emerald, warning=amber, danger=red, info=primary).
// Icons use the 600 shade on light backgrounds and 400 on dark so they stay legible
// on the tinted x-100 / x-900 panels in both themes.
const typeStyles: Record<Notification['type'], { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'bg-primary-100 dark:bg-primary-900/90',
    border: 'border-primary-600',
    icon: 'text-primary-600 dark:text-primary-400',
  },
  success: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/90',
    border: 'border-emerald-600',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    bg: 'bg-amber-100 dark:bg-amber-900/90',
    border: 'border-amber-600',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900/90',
    border: 'border-red-600',
    icon: 'text-red-600 dark:text-red-400',
  },
}

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: (id: string) => void
}) {
  const styles = typeStyles[notification.type]

  return (
    <div
      role={notification.type === 'error' ? 'alert' : 'status'}
      className={`${styles.bg} border-l-4 ${styles.border} rounded-lg shadow-lg p-4 max-w-sm w-full backdrop-blur-sm animate-slide-in`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 mt-0.5 ${styles.icon}`}>
          {notification.type === 'success' ? (
            <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : notification.type === 'error' ? (
            <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ) : notification.type === 'warning' ? (
            <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-dao-text">{notification.title}</p>
          {notification.message && (
            <p className="mt-1 text-sm text-dao-text-secondary">{notification.message}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(notification.id)}
          className="flex-shrink-0 text-dao-text-muted hover:text-dao-text transition-colors"
          aria-label="Dismiss notification"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function NotificationContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    return notificationManager.subscribe(setNotifications)
  }, [])

  const handleDismiss = useCallback((id: string) => {
    notificationManager.dismiss(id)
  }, [])

  // Keep the live region mounted even when empty so screen readers announce toasts as
  // they appear (a region added at the same time as its content may not be announced).
  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <NotificationToast
            notification={notification}
            onDismiss={handleDismiss}
          />
        </div>
      ))}
    </div>
  )
}

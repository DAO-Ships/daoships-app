// ═══════════════════════════════════════════════════════════════════════════
// Toast Notification Manager (Singleton)
//
// Manages in-app toast notifications with a subscribe/publish pattern.
// UI components subscribe to notification changes and render toasts.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Notification severity levels.
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info'

/**
 * A single notification instance.
 */
export interface Notification {
  /** Unique identifier for this notification */
  id: string
  /** Severity / visual style */
  type: NotificationType
  /** Short heading text */
  title: string
  /** Longer description text */
  message: string
  /** Auto-dismiss duration in milliseconds (0 = persistent) */
  duration: number
}

/**
 * Default auto-dismiss durations per notification type (milliseconds).
 */
const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: 10000,
}

/**
 * Incrementing counter for unique notification IDs.
 */
let idCounter = 0

/**
 * Generate a unique notification ID.
 */
function generateId(): string {
  idCounter += 1
  return `notification-${idCounter}-${Date.now()}`
}

/**
 * Listener function type for notification state changes.
 */
type NotificationListener = (notifications: Notification[]) => void

/**
 * Singleton notification manager.
 *
 * Usage:
 *   // Show a notification
 *   notificationManager.notify('success', 'Proposal Submitted', 'Your proposal was submitted successfully.')
 *
 *   // Subscribe in a React component
 *   useEffect(() => {
 *     return notificationManager.subscribe(setNotifications)
 *   }, [])
 *
 *   // Dismiss
 *   notificationManager.dismiss(notification.id)
 */
const MAX_NOTIFICATIONS = 20
const DEDUP_WINDOW_MS = 2000

class NotificationManager {
  private notifications: Notification[] = []
  private listeners: Set<NotificationListener> = new Set()
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  /**
   * Emit a new notification.
   *
   * @param type     - Notification type (success, error, warning, info)
   * @param title    - Short heading text
   * @param message  - Description text
   * @param duration - Auto-dismiss duration in ms. Defaults per type. Use 0 for persistent.
   * @returns The notification ID (can be used to dismiss programmatically)
   */
  notify(
    type: NotificationType,
    title: string,
    message: string,
    duration?: number,
  ): string {
    // Dedup: skip if same title+message was added recently
    const now = Date.now()
    const isDuplicate = this.notifications.some(
      (n) => n.title === title && n.message === message && now - parseInt(n.id.split('-')[2] || '0', 10) < DEDUP_WINDOW_MS,
    )
    if (isDuplicate) return this.notifications[this.notifications.length - 1]?.id ?? ''

    const id = generateId()
    const actualDuration = duration ?? DEFAULT_DURATIONS[type]

    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration: actualDuration,
    }

    this.notifications = [...this.notifications, notification]

    // Evict oldest if over cap
    while (this.notifications.length > MAX_NOTIFICATIONS) {
      const oldest = this.notifications[0]
      this.notifications = this.notifications.slice(1)
      const oldTimer = this.timers.get(oldest.id)
      if (oldTimer) { clearTimeout(oldTimer); this.timers.delete(oldest.id) }
    }

    this.emit()

    // Auto-dismiss if duration > 0
    if (actualDuration > 0) {
      const timer = setTimeout(() => {
        this.dismiss(id)
      }, actualDuration)
      this.timers.set(id, timer)
    }

    return id
  }

  /**
   * Dismiss (remove) a notification by ID.
   *
   * @param id - The notification ID to dismiss
   */
  dismiss(id: string): void {
    // Clear auto-dismiss timer if present
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }

    this.notifications = this.notifications.filter((n) => n.id !== id)
    this.emit()
  }

  /**
   * Dismiss all notifications.
   */
  dismissAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.notifications = []
    this.emit()
  }

  /**
   * Subscribe to notification state changes.
   * The listener is called immediately with the current notifications,
   * and again whenever notifications are added or removed.
   *
   * @param listener - Callback receiving the current notifications array
   * @returns Unsubscribe function
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener)

    // Emit current state immediately
    listener(this.notifications)

    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Get the current notifications (snapshot).
   */
  getNotifications(): Notification[] {
    return this.notifications
  }

  /**
   * Notify all listeners of the current state.
   */
  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.notifications)
    }
  }
}

/**
 * Singleton instance for the entire application.
 */
export const notificationManager = new NotificationManager()

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ═══════════════════════════════════════════════════════════════════════════
// UI Store - Sidebar, theme, and notifications
// ═══════════════════════════════════════════════════════════════════════════

export type ThemeChoice = 'light' | 'dark' | 'system'

export interface AppNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  /** Auto-dismiss after this many milliseconds (0 = manual dismiss only) */
  durationMs: number
  createdAt: number
}

interface UiStore {
  sidebarOpen: boolean
  theme: ThemeChoice
  notifications: AppNotification[]

  // Sidebar
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Theme
  setTheme: (theme: ThemeChoice) => void
  /**
   * Must be called BEFORE React render in main.tsx.
   * Applies the correct class to document.documentElement so Tailwind's
   * dark: variants are active from the very first paint.
   */
  initializeTheme: () => void

  // Notifications
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

let nextNotificationId = 0

/**
 * Resolve 'system' to the actual OS preference.
 */
const resolveTheme = (choice: ThemeChoice): 'light' | 'dark' => {
  if (choice !== 'system') return choice
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply or remove the 'dark' class on <html>.
 */
const applyTheme = (choice: ThemeChoice) => {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(choice)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      theme: 'system' as ThemeChoice,
      notifications: [],

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) =>
        set({ sidebarOpen: open }),

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      initializeTheme: () => {
        applyTheme(get().theme)
      },

      addNotification: (notification) =>
        set((state) => {
          const id = `notif-${Date.now()}-${nextNotificationId++}`
          const newNotification: AppNotification = {
            ...notification,
            id,
            createdAt: Date.now(),
          }
          return { notifications: [...state.notifications, newNotification] }
        }),

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      clearNotifications: () =>
        set({ notifications: [] }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen, theme: state.theme }),
    }
  )
)

// Listen for OS theme changes when theme is set to 'system'
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useUiStore.getState()
    if (theme === 'system') {
      applyTheme('system')
    }
  })
}

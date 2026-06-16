import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ═══════════════════════════════════════════════════════════════════════════
// UI Store - Sidebar and theme
// ═══════════════════════════════════════════════════════════════════════════

export type ThemeChoice = 'light' | 'dark' | 'system'

interface UiStore {
  sidebarOpen: boolean
  theme: ThemeChoice

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
}

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
      // Mobile drawer starts closed; on desktop the sidebar is always visible via CSS
      // (lg:translate-x-0), so this only governs the small-screen drawer.
      sidebarOpen: false,
      theme: 'system' as ThemeChoice,

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
    }),
    {
      name: 'ui-storage',
      // Only persist theme — sidebarOpen is ephemeral UI; persisting it left the mobile
      // drawer open over content on reload.
      partialize: (state) => ({ theme: state.theme }),
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

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ═══════════════════════════════════════════════════════════════════════════
// DAO Store - Tracks the currently selected DAO and recent DAO history
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum number of recent DAO IDs to persist. */
const MAX_RECENT_DAOS = 10

interface DaoStore {
  /** Contract address of the currently selected DAO, or null */
  currentDaoId: string | null
  /** Most recently visited DAO IDs (newest first, max 10) */
  recentDaoIds: string[]

  // Actions
  setCurrentDao: (daoId: string) => void
  clearCurrentDao: () => void
}

export const useDaoStore = create<DaoStore>()(
  persist(
    (set) => ({
      currentDaoId: null,
      recentDaoIds: [],

      setCurrentDao: (daoId) =>
        set((state) => {
          // Remove daoId if it already exists, then prepend it
          const filtered = state.recentDaoIds.filter(
            (id) => id.toLowerCase() !== daoId.toLowerCase()
          )
          const recentDaoIds = [daoId, ...filtered].slice(0, MAX_RECENT_DAOS)
          return { currentDaoId: daoId, recentDaoIds }
        }),

      clearCurrentDao: () =>
        set({ currentDaoId: null }),
    }),
    {
      name: 'dao-storage',
      // Only persist recentDaoIds; currentDaoId is session-only
      partialize: (state) => ({ recentDaoIds: state.recentDaoIds }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Validate recentDaoIds is an array of strings
        if (
          !Array.isArray(state.recentDaoIds) ||
          !state.recentDaoIds.every((id: unknown) => typeof id === 'string')
        ) {
          state.recentDaoIds = []
        }
      },
    }
  )
)

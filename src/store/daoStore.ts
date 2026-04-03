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
  /** Human-readable name of the current DAO, or null */
  currentDaoName: string | null
  /** Most recently visited DAO IDs (newest first, max 10) */
  recentDaoIds: string[]

  // Actions
  setCurrentDao: (daoId: string, name?: string) => void
  clearCurrentDao: () => void
}

export const useDaoStore = create<DaoStore>()(
  persist(
    (set) => ({
      currentDaoId: null,
      currentDaoName: null,
      recentDaoIds: [],

      setCurrentDao: (daoId, name) =>
        set((state) => {
          const filtered = state.recentDaoIds.filter(
            (id) => id.toLowerCase() !== daoId.toLowerCase()
          )
          const recentDaoIds = [daoId, ...filtered].slice(0, MAX_RECENT_DAOS)
          return { currentDaoId: daoId, currentDaoName: name ?? null, recentDaoIds }
        }),

      clearCurrentDao: () =>
        set({ currentDaoId: null, currentDaoName: null }),
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

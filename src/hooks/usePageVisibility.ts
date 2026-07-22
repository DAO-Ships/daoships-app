import { useSyncExternalStore } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// usePageVisibility — ONE document listener, shared by every consumer
// ───────────────────────────────────────────────────────────────────────────
// This previously created per-consumer state and registered its own
// `visibilitychange` listener on every call. With 17 call sites (16 query hooks plus
// OngoingPolls) a typical DAO page had several live instances, so a single tab
// focus/blur fired N listeners and produced N independent state updates.
//
// Now a module-level subscription fans out through useSyncExternalStore: one listener
// regardless of how many components read it, and React batches the notification.
//
// The public signature is unchanged — `(): boolean` — so no call site needed editing.
// ═══════════════════════════════════════════════════════════════════════════

type Listener = () => void

const listeners = new Set<Listener>()
let documentListenerAttached = false

function handleVisibilityChange() {
  for (const listener of listeners) listener()
}

/**
 * Subscribe to visibility changes.
 *
 * The document listener is attached on the first subscriber and removed when the last
 * one unsubscribes, so nothing stays registered once no component cares.
 */
function subscribe(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange)

  if (!documentListenerAttached && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    documentListenerAttached = true
  }

  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0 && documentListenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      documentListenerAttached = false
    }
  }
}

function getSnapshot(): boolean {
  if (typeof document === 'undefined') return true
  return !document.hidden
}

/** Prerender snapshot — always visible, matching the previous initial state. */
function getServerSnapshot(): boolean {
  return true
}

/**
 * Whether the browser tab/window is currently visible.
 *
 * Returns `false` when the tab is hidden or minimised. Used to pause polling intervals
 * while the user is not actively viewing the page — which matters most on mobile, where
 * background polling costs battery and metered data.
 */
export function usePageVisibility(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

import { QueryClient } from '@tanstack/react-query'

// ═══════════════════════════════════════════════════════════════════════════
// React Query Client
// ═══════════════════════════════════════════════════════════════════════════
//
// Shared QueryClient instance. Wrap the app in <QueryClientProvider>
// and pass this client so all hooks share the same cache.
//
// Defaults:
// - refetchOnWindowFocus: false  (DAO state changes infrequently)
// - retry: 1                     (one automatic retry on transient failures)
// - staleTime: 30 s              (avoid duplicate requests within 30 seconds)
// - gcTime: 5 min                (keep unused cache entries for 5 minutes)
// ═══════════════════════════════════════════════════════════════════════════

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
})

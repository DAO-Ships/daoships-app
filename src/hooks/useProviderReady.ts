import { useWalletStore } from '@/store/walletStore'

/**
 * Reactive replacement for `baseService.hasProvider()`.
 *
 * `hasProvider()` is an imperative read of a module singleton with no subscription, so
 * a query gated on it (`enabled: baseService.hasProvider()`) never re-evaluated when the
 * provider was actually installed — it only appeared to work because something unrelated
 * re-rendered soon after. wagmi's `isConnected` flips BEFORE the quais bridge is ready,
 * so gating on that instead is also wrong.
 *
 * Use this in `enabled:` flags and anywhere else provider readiness must trigger a
 * re-render.
 */
export function useProviderReady(): boolean {
  return useWalletStore((s) => s.providerReady)
}

import { useCallback, useEffect, useRef } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useWalletStore } from '@/store/walletStore'
import { baseService } from '@/services/core/BaseService'
import { providerToQuaisSigner } from '@/config/walletBridge'
import { verifyContractDeployments, CONTRACT_ADDRESSES, NETWORK_CONFIG } from '@/config/contracts'
import { notificationManager } from '@/services/utils/NotificationManager'

/**
 * Primary wallet hook for the app.
 *
 * Uses wagmi connectors (injected + walletConnect) for connection management,
 * then bridges the raw EIP-1193 provider to a quais Signer for on-chain writes.
 *
 * Connection UI is the 2-button ConnectModal — `connect()` opens it,
 * `connectWith(id)` is what the modal buttons call.
 */
export function useWallet() {
  const { address, isConnected, connector, chainId: wagmiChainId } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { disconnect: wagmiDisconnect } = useDisconnect()
  const {
    setConnected,
    setProviderReady,
    setConnectModalOpen,
    setError,
  } = useWalletStore()

  const prevAddressRef = useRef<string | null>(null)
  const signerRef = useRef<unknown>(null)
  // Tracks which chainId was last bytecode-verified, so a network switch re-verifies
  // (instead of the previous one-time-per-session guard that missed chain changes).
  const verifiedChainRef = useRef<number | null>(null)

  // ── Sync connection state immediately on account change ──────────────
  useEffect(() => {
    if (isConnected && address) {
      // Account switched: clear stale signer
      if (prevAddressRef.current && prevAddressRef.current !== address) {
        signerRef.current = null
        baseService.setSigner(null)
        setProviderReady(false)
      }
      prevAddressRef.current = address
      setConnected(true, address)
    } else if (!isConnected) {
      prevAddressRef.current = null
      signerRef.current = null
      baseService.setSigner(null)
      setProviderReady(false)
      setConnected(false, null)
    }
  }, [isConnected, address, setConnected, setProviderReady])

  // ── Keep BaseService's chain in sync so write paths hard-block wrong-network state ──
  useEffect(() => {
    baseService.setChainId(isConnected ? wagmiChainId ?? null : null)
  }, [isConnected, wagmiChainId])

  // ── Async signer bridge (runs after connection state is synced) ──────
  useEffect(() => {
    if (!connector || !isConnected || !address) return
    if (typeof connector.getProvider !== 'function') return

    let isActive = true

    connector.getProvider()
      .then(async (rawProvider: unknown) => {
        if (!isActive || !rawProvider) return

        const typedProvider = rawProvider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
        const signer = await providerToQuaisSigner(typedProvider)
        if (!isActive) return

        signerRef.current = signer
        baseService.setSigner(signer)
        // Reactive counterpart to baseService.hasProvider(), which ~19 sites read
        // imperatively with no subscription.
        setProviderReady(true)

        // Bytecode verification of configured contracts (via wallet's EIP-1193 provider
        // directly — quais.BrowserProvider.getCode silently returns '0x' for every lookup
        // against Pelagus on Quai testnets). Re-runs whenever the chain changes so a
        // post-connect network switch is caught, not just the first connect.
        if (verifiedChainRef.current !== (wagmiChainId ?? null)) {
          verifiedChainRef.current = wagmiChainId ?? null
          verifyContractDeployments(typedProvider)
            .then((missing) => {
              if (missing.length > 0) {
                const allMissing = missing.length === Object.keys(CONTRACT_ADDRESSES).length
                const body = allMissing
                  ? `No bytecode found at any configured contract address. Your wallet is likely on the wrong network — switch to ${NETWORK_CONFIG.chainName} (chain ${NETWORK_CONFIG.chainId}) and refresh.`
                  : `${missing.length} configured contract${missing.length === 1 ? '' : 's'} not deployed at expected address. Check VITE_* env vars in .env. Launch and proposal actions may fail.`
                notificationManager.notify('error', 'Contract configuration error', body, 0)
              }
            })
            .catch((err) => console.warn('[useWallet] Contract verification failed:', err))
        }
      })
      .catch((err: unknown) => {
        if (!isActive) return
        console.error('[useWallet] Failed to create quais signer:', err)
      })

    return () => { isActive = false }
  }, [connector, isConnected, address, wagmiChainId, setProviderReady])

  // ── Actions ──────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    setError(null)
    setConnectModalOpen(true)
  }, [setError, setConnectModalOpen])

  const connectWith = useCallback(async (connectorId: 'injected' | 'walletConnect') => {
    const target = connectors.find((c) => c.id === connectorId)
    if (!target) {
      setError(`Connector "${connectorId}" not available`)
      return
    }
    setError(null)
    try {
      await connectAsync({ connector: target })
      setConnectModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
      throw err
    }
  }, [connectAsync, connectors, setError, setConnectModalOpen])

  const disconnect = useCallback(() => {
    wagmiDisconnect()
    signerRef.current = null
    baseService.setSigner(null)
    setConnected(false, null)
  }, [wagmiDisconnect, setConnected])

  return {
    connected: isConnected,
    address: address ?? null,
    signer: signerRef.current,
    chainId: wagmiChainId ?? null,
    connect,
    connectWith,
    disconnect,
  }
}

import { useCallback, useEffect, useRef } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useWalletStore } from '@/store/walletStore'
import { baseService } from '@/services/core/BaseService'
import { providerToQuaisSigner } from '@/config/walletBridge'

/**
 * Primary wallet hook for the app.
 *
 * Uses Reown AppKit (wagmi) for connection management, then bridges
 * the raw EIP-1193 provider to a quais Signer for on-chain writes.
 *
 * Handles:
 * - Account switching (clears stale signer, re-bridges)
 * - Disconnection (cleans up signer, store)
 * - Async signer creation without blocking the UI
 */
export function useWallet() {
  const { address, isConnected } = useAppKitAccount()
  const { connector, chainId: wagmiChainId } = useAccount()
  const { disconnect: wagmiDisconnect } = useDisconnect()
  const { open } = useAppKit()
  const { connected, address: storeAddress, setConnected, setDisconnected } = useWalletStore()

  const prevAddressRef = useRef<string | null>(null)
  const signerRef = useRef<unknown>(null)

  // ── Sync connection state immediately on account change ──────────────
  useEffect(() => {
    if (isConnected && address) {
      // Account switched: clear stale signer
      if (prevAddressRef.current && prevAddressRef.current !== address) {
        signerRef.current = null
        baseService.setSigner(null)
      }
      prevAddressRef.current = address
      setConnected(address, null, null, 0)
    } else if (!isConnected) {
      prevAddressRef.current = null
      signerRef.current = null
      baseService.setSigner(null)
      setDisconnected()
    }
  }, [isConnected, address, setConnected, setDisconnected])

  // ── Async signer bridge (runs after connection state is synced) ──────
  useEffect(() => {
    if (!connector || !isConnected || !address) return
    if (typeof connector.getProvider !== 'function') return

    let isActive = true

    connector.getProvider()
      .then(async (rawProvider: any) => {
        if (!isActive || !rawProvider) return

        const signer = await providerToQuaisSigner(rawProvider)
        if (!isActive) return

        signerRef.current = signer
        baseService.setSigner(signer)

        // Update store with signer now available
        setConnected(address, signer, null, 0)
      })
      .catch((err: unknown) => {
        if (!isActive) return
        console.error('[useWallet] Failed to create quais signer:', err)
      })

    return () => { isActive = false }
  }, [connector, isConnected, address, setConnected])

  // ── Actions ──────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    await open()
  }, [open])

  const disconnect = useCallback(() => {
    wagmiDisconnect()
    signerRef.current = null
    baseService.setSigner(null)
    setDisconnected()
  }, [wagmiDisconnect, setDisconnected])

  return {
    connected: isConnected || connected,
    address: address ?? storeAddress,
    signer: signerRef.current,
    chainId: wagmiChainId ?? null,
    connect,
    disconnect,
  }
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

interface AccountState {
  address: string | undefined
  isConnected: boolean
  connector: unknown
  chainId: number | undefined
}
const account = vi.hoisted(() => ({
  value: { address: undefined, isConnected: false, connector: undefined, chainId: undefined } as AccountState,
}))
const conn = vi.hoisted(() => ({
  connectAsync: vi.fn().mockResolvedValue(undefined),
  connectors: [{ id: 'injected' }, { id: 'walletConnect' }] as Array<{ id: string }>,
  disconnect: vi.fn(),
}))
vi.mock('wagmi', () => ({
  useAccount: () => account.value,
  useConnect: () => ({ connectAsync: conn.connectAsync, connectors: conn.connectors }),
  useDisconnect: () => ({ disconnect: conn.disconnect }),
}))

const store = vi.hoisted(() => ({
  setConnected: vi.fn(),
  setProviderReady: vi.fn(),
  setConnectModalOpen: vi.fn(),
  setError: vi.fn(),
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (s: typeof store) => unknown) => selector(store),
}))

const bs = vi.hoisted(() => ({ setSigner: vi.fn(), setChainId: vi.fn() }))
vi.mock('@/services/core/BaseService', () => ({ baseService: bs }))
vi.mock('@/config/walletBridge', () => ({ providerToQuaisSigner: vi.fn() }))
vi.mock('@/config/contracts', () => ({
  verifyContractDeployments: vi.fn().mockResolvedValue([]),
  CONTRACT_ADDRESSES: {},
  NETWORK_CONFIG: { chainName: 'Quai', chainId: 9 },
}))
vi.mock('@/services/utils/NotificationManager', () => ({ notificationManager: { notify: vi.fn() } }))

import { useWallet } from '../useWallet'

beforeEach(() => {
  account.value = { address: undefined, isConnected: false, connector: undefined, chainId: undefined }
  Object.values(store).forEach((f) => f.mockClear())
  Object.values(bs).forEach((f) => f.mockClear())
  conn.connectAsync.mockClear().mockResolvedValue(undefined)
  conn.disconnect.mockClear()
  conn.connectors = [{ id: 'injected' }, { id: 'walletConnect' }]
})

describe('connect', () => {
  it('clears any prior error and opens the connect modal', () => {
    const { result } = renderHook(() => useWallet())
    act(() => result.current.connect())
    expect(store.setError).toHaveBeenCalledWith(null)
    expect(store.setConnectModalOpen).toHaveBeenCalledWith(true)
  })
})

describe('connectWith', () => {
  it('connects via the matching connector and closes the modal on success', async () => {
    const { result } = renderHook(() => useWallet())
    await act(async () => {
      await result.current.connectWith('walletConnect')
    })
    expect(conn.connectAsync).toHaveBeenCalledWith({ connector: { id: 'walletConnect' } })
    expect(store.setConnectModalOpen).toHaveBeenCalledWith(false)
  })

  it('errors without connecting when the requested connector is unavailable', async () => {
    conn.connectors = [{ id: 'injected' }] // walletConnect not configured
    const { result } = renderHook(() => useWallet())
    await act(async () => {
      await result.current.connectWith('walletConnect')
    })
    expect(store.setError).toHaveBeenCalledWith('Connector "walletConnect" not available')
    expect(conn.connectAsync).not.toHaveBeenCalled()
  })

  it('surfaces the failure message and rethrows when connectAsync rejects', async () => {
    conn.connectAsync.mockRejectedValueOnce(new Error('user rejected'))
    const { result } = renderHook(() => useWallet())
    await act(async () => {
      await expect(result.current.connectWith('injected')).rejects.toThrow('user rejected')
    })
    expect(store.setError).toHaveBeenCalledWith('user rejected')
    expect(store.setConnectModalOpen).not.toHaveBeenCalledWith(false)
  })
})

describe('disconnect', () => {
  it('tears down wagmi, the signer, and the connection store', () => {
    const { result } = renderHook(() => useWallet())
    act(() => result.current.disconnect())
    expect(conn.disconnect).toHaveBeenCalled()
    expect(bs.setSigner).toHaveBeenCalledWith(null)
    expect(store.setConnected).toHaveBeenCalledWith(false, null)
  })
})

describe('connection-state sync effect', () => {
  it('marks the store connected with the address when wagmi reports a connection', () => {
    account.value = { address: '0xabc', isConnected: true, connector: undefined, chainId: 9 }
    renderHook(() => useWallet())
    expect(store.setConnected).toHaveBeenCalledWith(true, '0xabc')
  })

  it('resets signer and provider-ready when wagmi reports disconnected', () => {
    renderHook(() => useWallet()) // starts disconnected
    expect(store.setConnected).toHaveBeenCalledWith(false, null)
    expect(store.setProviderReady).toHaveBeenCalledWith(false)
    expect(bs.setSigner).toHaveBeenCalledWith(null)
  })

  it('clears the stale signer when the connected account switches', () => {
    account.value = { address: '0xAAA', isConnected: true, connector: undefined, chainId: 9 }
    const { rerender } = renderHook(() => useWallet())
    bs.setSigner.mockClear()
    store.setProviderReady.mockClear()

    account.value = { ...account.value, address: '0xBBB' }
    rerender()

    expect(bs.setSigner).toHaveBeenCalledWith(null)
    expect(store.setProviderReady).toHaveBeenCalledWith(false)
    expect(store.setConnected).toHaveBeenCalledWith(true, '0xBBB')
  })
})

describe('chain sync effect', () => {
  it('pushes the connected chainId into BaseService so write paths can block wrong-network', () => {
    account.value = { address: '0xabc', isConnected: true, connector: undefined, chainId: 9 }
    renderHook(() => useWallet())
    expect(bs.setChainId).toHaveBeenCalledWith(9)
  })

  it('pushes null when disconnected', () => {
    renderHook(() => useWallet())
    expect(bs.setChainId).toHaveBeenCalledWith(null)
  })
})

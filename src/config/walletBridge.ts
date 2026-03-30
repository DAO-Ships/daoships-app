import { BrowserProvider } from 'quais'
import type { quais } from 'quais'

/**
 * Bridge a raw EIP-1193 provider to a quais Signer.
 *
 * Queries the chain ID directly from the wallet so BrowserProvider
 * doesn't need to call _detectNetwork (which can hang with CORS-blocked
 * public RPCs). Works for both Pelagus and WalletConnect.
 */
export async function providerToQuaisSigner(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
): Promise<quais.Signer> {
  const hexChainId = await provider.request({ method: 'eth_chainId' }) as string
  const chainId = Number(hexChainId)
  const quaisProvider = new BrowserProvider(provider, chainId)
  const signer = await quaisProvider.getSigner()
  return signer
}

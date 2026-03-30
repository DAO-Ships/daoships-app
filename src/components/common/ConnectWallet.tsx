import { useWallet } from '@/hooks/useWallet'
import { AddressDisplay } from './AddressDisplay'
import { Button } from './Button'

// ═══════════════════════════════════════════════════════════════════════════
// ConnectWallet - Wallet connect / disconnect button
// ═══════════════════════════════════════════════════════════════════════════

export function ConnectWallet() {
  const { connected, address, connect, disconnect } = useWallet()

  if (connected && address) {
    return (
      <div className="flex items-center gap-3">
        <AddressDisplay address={address} showExplorer={false} />
        <Button variant="secondary" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    )
  }

  return (
    <Button variant="primary" size="sm" onClick={connect}>
      Connect Wallet
    </Button>
  )
}

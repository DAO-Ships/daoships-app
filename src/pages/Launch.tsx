import { usePageTitle } from '@/hooks/usePageTitle'
import { useWallet } from '@/hooks/useWallet'
import { LaunchWizard } from '@/components/launch/LaunchWizard'
import { ConnectWallet } from '@/components/common/ConnectWallet'

// ═══════════════════════════════════════════════════════════════════════════
// Launch - Wrapper for the LaunchWizard with wallet gate
// ═══════════════════════════════════════════════════════════════════════════

export function Launch() {
  usePageTitle('Launch a DAO')
  const { connected } = useWallet()

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold font-display text-dao-text">
          Connect your wallet to launch a DAO
        </h2>
        <p className="text-dao-text-muted text-center max-w-md">
          You need a connected Pelagus wallet to deploy a new DAO contract
          on Quai Network.
        </p>
        <ConnectWallet />
      </div>
    )
  }

  return <LaunchWizard />
}

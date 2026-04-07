import { Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useDaos } from '@/hooks/useDaos'
import { useUserDaos } from '@/hooks/useUserDaos'
import { useWallet } from '@/hooks/useWallet'
import { useUiStore } from '@/store/uiStore'
import { DaoCard } from '@/components/dao/DaoCard'
import { Button } from '@/components/common/Button'
import { ConnectWallet } from '@/components/common/ConnectWallet'
import { EmptyState } from '@/components/common/EmptyState'
import { Loading } from '@/components/common/Loading'

// ═══════════════════════════════════════════════════════════════════════════
// Home - Landing page with hero, recent DAOs, and user DAOs
// ═══════════════════════════════════════════════════════════════════════════

export function Home() {
  usePageTitle()
  const { connected } = useWallet()
  const { theme } = useUiStore()
  const isDark = theme === 'dark'
  const { data: daos, isLoading: daosLoading } = useDaos()
  const { data: userDaos, isLoading: userDaosLoading } = useUserDaos()

  // Show the most recently created DAOs (up to 6)
  const recentDaos = daos?.slice(0, 6) ?? []

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16 px-4">
        <img
          src={isDark ? '/logos/dao_ships_helm_dark_transparent.svg' : '/logos/dao_ships_helm_light_transparent.svg'}
          alt="DAO Ships"
          className="w-24 h-24 mx-auto mb-6 rounded-2xl"
        />
        <h1 className="text-4xl sm:text-5xl font-bold font-display text-dao-text mb-4">
          DAO Ships
        </h1>
        <p className="text-lg text-dao-text-muted max-w-2xl mx-auto mb-8">
          Launch, govern, and manage decentralized autonomous organizations on
          Quai Network. Transparent on-chain governance for the Quai ecosystem.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link to="/launch">
            <Button variant="primary" size="lg">
              Launch a DAO
            </Button>
          </Link>
          <Link to="/explore">
            <Button variant="secondary" size="lg">
              Explore DAOs
            </Button>
          </Link>
        </div>
      </section>

      {/* User's DAOs (when connected) */}
      {connected && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold font-display text-dao-text">Your DAOs</h2>
          </div>
          {userDaosLoading ? (
            <Loading fullPage />
          ) : userDaos && userDaos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userDaos.map((dao) => (
                <DaoCard key={dao.id} dao={dao} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No DAOs yet"
              description="You are not a member of any DAOs. Launch a new one or get invited to an existing DAO."
              action={
                <Link to="/launch">
                  <Button variant="primary">Launch a DAO</Button>
                </Link>
              }
            />
          )}
        </section>
      )}

      {/* Not connected prompt */}
      {!connected && (
        <section className="card px-8 py-10 text-center max-w-xl mx-auto">
          <h3 className="text-xl font-semibold text-dao-text mb-2">
            Connect your wallet
          </h3>
          <p className="text-dao-text-muted mb-6">
            Connect your Pelagus wallet to see your DAOs and participate in
            governance.
          </p>
          <div className="flex justify-center">
            <ConnectWallet />
          </div>
        </section>
      )}

      {/* Recent DAOs */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold font-display text-dao-text">Recent DAOs</h2>
          <Link
            to="/explore"
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            View all
          </Link>
        </div>
        {daosLoading ? (
          <Loading fullPage />
        ) : recentDaos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentDaos.map((dao) => (
              <DaoCard key={dao.id} dao={dao} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No DAOs found"
            description="Be the first to launch a DAO on Quai Network."
            action={
              <Link to="/launch">
                <Button variant="primary">Launch a DAO</Button>
              </Link>
            }
          />
        )}
      </section>
    </div>
  )
}

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
import { SkeletonDaoCard } from '@/components/common/Skeleton'
import { BrandPattern } from '@/components/common/BrandPattern'

// ═══════════════════════════════════════════════════════════════════════════
// Home - Landing page with hero, recent DAOs, and user DAOs
// ═══════════════════════════════════════════════════════════════════════════

export function Home() {
  usePageTitle()
  const { connected } = useWallet()
  const theme = useUiStore((s) => s.theme)
  const isDark = theme === 'dark'
  const { data: daos, isLoading: daosLoading } = useDaos()
  const { data: userDaos, isLoading: userDaosLoading } = useUserDaos()

  // Show the most recently created DAOs (up to 6)
  const recentDaos = daos?.slice(0, 6) ?? []

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-dao-border/60 bg-gradient-dao-radial text-center py-16 sm:py-20 px-4">
        {/* Ambient helm-logo motif, bleeding off the corners. */}
        <BrandPattern className="absolute -right-20 -top-24 h-80 w-80 z-0 text-primary-500/[0.07]" />
        <BrandPattern className="absolute -left-24 -bottom-24 h-72 w-72 z-0 text-accent-500/[0.05]" />
        <div className="relative z-10">
          <img
            src={isDark ? '/logos/dao_ships_helm_dark_transparent.svg' : '/logos/dao_ships_helm_light_transparent.svg'}
            alt="DAOShips"
            className="w-24 h-24 mx-auto mb-6 rounded-2xl shadow-indigo-glow"
          />
          <h1 className="text-4xl sm:text-5xl font-bold font-display mb-4">
            <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
              DAOShips
            </span>
          </h1>
          <p className="text-lg text-dao-text-muted max-w-2xl mx-auto mb-8">
            Charter a DAO and govern it on-chain. Transparent proposals, voting, and
            treasury management for the Quai ecosystem.
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
        </div>
      </section>

      {/* User's DAOs (when connected) */}
      {connected && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold font-display text-dao-text">Your DAOs</h2>
          </div>
          {userDaosLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }, (_, i) => <SkeletonDaoCard key={i} />)}
            </div>
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
        <section className="card relative overflow-hidden px-8 py-10 text-center max-w-xl mx-auto">
          <BrandPattern className="absolute -right-16 -bottom-20 h-64 w-64 z-0 text-primary-500/[0.06]" />
          <div className="relative z-10">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <SkeletonDaoCard key={i} />)}
          </div>
        ) : recentDaos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentDaos.map((dao) => (
              <DaoCard key={dao.id} dao={dao} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Calm waters ahead"
            description="No DAOs have launched yet. Be the first to chart a course on Quai Network."
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

import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/config/wagmi'
import { queryClient } from '@/lib/queryClient'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { NotificationContainer } from '@/components/common/NotificationContainer'
import { ConnectModal } from '@/components/common/ConnectModal'
import { Loading } from '@/components/common/Loading'
import { DaoLayout } from '@/components/layout/DaoLayout'

// Pages — lazy-loaded for code splitting
const Home = lazy(() => import('@/pages/Home').then((m) => ({ default: m.Home })))
const Explore = lazy(() => import('@/pages/Explore').then((m) => ({ default: m.Explore })))
const Launch = lazy(() => import('@/pages/Launch').then((m) => ({ default: m.Launch })))
const Overview = lazy(() => import('@/pages/dao/Overview').then((m) => ({ default: m.Overview })))
const Proposals = lazy(() => import('@/pages/dao/Proposals').then((m) => ({ default: m.Proposals })))
const ProposalDetail = lazy(() => import('@/pages/dao/ProposalDetail').then((m) => ({ default: m.ProposalDetail })))
const NewProposal = lazy(() => import('@/pages/dao/NewProposal').then((m) => ({ default: m.NewProposal })))
const Members = lazy(() => import('@/pages/dao/Members').then((m) => ({ default: m.Members })))
const Treasury = lazy(() => import('@/pages/dao/Treasury').then((m) => ({ default: m.Treasury })))
const Navigators = lazy(() => import('@/pages/dao/Navigators').then((m) => ({ default: m.Navigators })))
const NavigatorDetail = lazy(() => import('@/pages/dao/NavigatorDetail').then((m) => ({ default: m.NavigatorDetail })))
const Settings = lazy(() => import('@/pages/dao/Settings').then((m) => ({ default: m.Settings })))


/**
 * Inner boundary that resets when the route changes, so navigating away from a broken
 * page recovers without a full reload. Must be inside <BrowserRouter> to read location.
 */
function RouteResetBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary resetKeys={[location.pathname]}>{children}</ErrorBoundary>
}


export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/* Wraps Layout, not just Routes: previously a throw in Header, Sidebar or
              ConnectModal escaped the boundary entirely and white-screened the app. */}
          <ErrorBoundary>
          <Layout>
            <RouteResetBoundary>
              <Suspense fallback={<Loading fullPage />}>
              <div className="animate-fade-in">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/launch" element={<Launch />} />
                <Route path="/summon" element={<Navigate to="/launch" replace />} />
                <Route path="/dao/:daoId" element={<DaoLayout />}>
                  <Route index element={<Overview />} />
                  <Route path="proposals" element={<Proposals />} />
                  <Route path="proposals/new" element={<NewProposal />} />
                  <Route path="proposals/:proposalId" element={<ProposalDetail />} />
                  <Route path="members" element={<Members />} />
                  <Route path="treasury" element={<Treasury />} />
                  <Route path="navigators" element={<Navigators />} />
                  <Route path="navigators/:navigatorAddress" element={<NavigatorDetail />} />
                  <Route path="shamans" element={<Navigate to="navigators" replace />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
              </div>
              </Suspense>
            </RouteResetBoundary>
            <ConnectModal />
          </Layout>
          </ErrorBoundary>
          <ErrorBoundary>
            <NotificationContainer />
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/config/wagmi'
import { queryClient } from '@/lib/queryClient'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { NotificationContainer } from '@/components/common/NotificationContainer'
import { DaoLayout } from '@/components/layout/DaoLayout'

// Pages
import { Home } from '@/pages/Home'
import { Explore } from '@/pages/Explore'
import { Launch } from '@/pages/Launch'
import { Overview } from '@/pages/dao/Overview'
import { Proposals } from '@/pages/dao/Proposals'
import { ProposalDetail } from '@/pages/dao/ProposalDetail'
import { NewProposal } from '@/pages/dao/NewProposal'
import { Members } from '@/pages/dao/Members'
import { Treasury } from '@/pages/dao/Treasury'
import { Navigators } from '@/pages/dao/Navigators'
import { NavigatorDetail } from '@/pages/dao/NavigatorDetail'
import { Settings } from '@/pages/dao/Settings'

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <ErrorBoundary>
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
            </ErrorBoundary>
          </Layout>
          <NotificationContainer />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

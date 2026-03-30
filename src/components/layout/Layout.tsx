import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { NotificationContainer } from '@/components/common/NotificationContainer'

// ═══════════════════════════════════════════════════════════════════════════
// Layout - Main app shell: sidebar + header + content area
// ═══════════════════════════════════════════════════════════════════════════

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-dao-dark-1">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <NotificationContainer />
    </div>
  )
}

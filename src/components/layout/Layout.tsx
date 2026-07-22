import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { ReindexRequiredBanner } from '@/components/common/ReindexRequiredBanner'

// ═══════════════════════════════════════════════════════════════════════════
// Layout - Main app shell: sidebar + header + content area
// ═══════════════════════════════════════════════════════════════════════════

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-dao-dark-1">
      {/* Skip link — first focusable element, lets keyboard/SR users bypass the sidebar nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <ReindexRequiredBanner />
        {/* pb clears the fixed BottomNav (+ safe-area) on mobile; resets ≥lg where it's hidden. */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-4 pt-4 sm:px-6 sm:pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
      {/*
        NotificationContainer is deliberately NOT rendered here. It is mounted once in
        App.tsx, inside its own ErrorBoundary so toasts survive a crash in this shell.
        Mounting it in both places gave every toast two independent subscriptions to
        notificationManager and rendered two stacked copies of every message.
      */}
    </div>
  )
}

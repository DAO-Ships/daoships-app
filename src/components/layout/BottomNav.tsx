import type { ReactNode } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore'
import {
  HomeIcon, ExploreIcon, LaunchIcon,
  OverviewIcon, ProposalsIcon, MembersIcon, TreasuryIcon, MenuIcon,
} from './navIcons'

// ═══════════════════════════════════════════════════════════════════════════
// BottomNav — thumb-reachable mobile navigation (hidden ≥lg, where the
// persistent Sidebar takes over). Context-aware: shows the 4 most-used
// destinations for the current scope (global vs inside-a-DAO) plus a Menu
// button that opens the full drawer for the long tail (Navigators, Settings,
// installed-navigator deep-links). Reuses the existing Sidebar drawer.
// ═══════════════════════════════════════════════════════════════════════════

interface BottomNavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

const itemBase =
  'flex flex-col items-center justify-center gap-1 flex-1 min-w-0 h-full text-2xs font-medium transition-colors'

function navItemClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? `${itemBase} text-primary-400`
    : `${itemBase} text-dao-text-muted hover:text-dao-text`
}

export function BottomNav() {
  const daoMatch = useMatch('/dao/:daoId/*')
  const daoId = daoMatch?.params.daoId
  // Hide where a page renders its own fixed bottom action bar (proposal vote bar),
  // so the two never stack. The top-of-header hamburger still opens nav there.
  const onProposalDetail = useMatch('/dao/:daoId/proposals/:proposalId')
  const { setSidebarOpen } = useUiStore()

  if (onProposalDetail) return null

  const items: BottomNavItem[] = daoId
    ? [
        { to: `/dao/${daoId}`, label: 'Overview', icon: <OverviewIcon />, end: true },
        { to: `/dao/${daoId}/proposals`, label: 'Proposals', icon: <ProposalsIcon /> },
        { to: `/dao/${daoId}/members`, label: 'Members', icon: <MembersIcon /> },
        { to: `/dao/${daoId}/treasury`, label: 'Treasury', icon: <TreasuryIcon /> },
      ]
    : [
        { to: '/', label: 'Home', icon: <HomeIcon />, end: true },
        { to: '/explore', label: 'Explore', icon: <ExploreIcon /> },
        { to: '/launch', label: 'Launch', icon: <LaunchIcon /> },
      ]

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-20 lg:hidden border-t border-dao-border bg-dao-dark-2/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch h-16">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
            {item.icon}
            <span className="max-w-full truncate px-1">{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className={`${itemBase} text-dao-text-muted hover:text-dao-text`}
          aria-label="Open menu"
        >
          <MenuIcon />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  )
}

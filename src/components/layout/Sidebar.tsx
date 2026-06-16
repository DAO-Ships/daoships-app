import { useMemo, useEffect, type ReactNode } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore'
import { useNavigators } from '@/hooks/useNavigators'
import { isNavigatorVisible } from '@/types/trust'
import {
  HomeIcon, ExploreIcon, LaunchIcon, OverviewIcon, ProposalsIcon,
  MembersIcon, TreasuryIcon, NavigatorsIcon, SettingsIcon, NavigatorMenuIcon,
} from './navIcons'

// ═══════════════════════════════════════════════════════════════════════════
// Sidebar - Navigation links with DAO context sub-navigation
// ═══════════════════════════════════════════════════════════════════════════

interface NavItemConfig {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

/** Styling helper for NavLink active/inactive states */
function navLinkClass({ isActive }: { isActive: boolean }) {
  const base =
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200'
  return isActive
    ? `${base} bg-primary-600/20 text-primary-400`
    : `${base} text-dao-text-muted hover:text-dao-text hover:bg-dao-surface`
}

function SidebarSection({ title, items, onNavigate }: { title?: string; items: NavItemConfig[]; onNavigate?: () => void }) {
  return (
    <div className="space-y-1">
      {title && (
        <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-dao-text-hint">
          {title}
        </p>
      )}
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={navLinkClass} end={item.end} onClick={onNavigate}>
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </div>
  )
}

// ── Main nav items ──────────────────────────────────────────────────────

const globalNavItems: NavItemConfig[] = [
  { to: '/', label: 'Home', icon: <HomeIcon />, end: true },
  { to: '/explore', label: 'Explore', icon: <ExploreIcon /> },
  { to: '/launch', label: 'Launch', icon: <LaunchIcon /> },
]

function getDaoNavItems(daoId: string, navigatorItems: NavItemConfig[] = []): NavItemConfig[] {
  const base = `/dao/${daoId}`
  return [
    { to: base, label: 'Overview', icon: <OverviewIcon />, end: true },
    { to: `${base}/proposals`, label: 'Proposals', icon: <ProposalsIcon /> },
    { to: `${base}/members`, label: 'Members', icon: <MembersIcon /> },
    { to: `${base}/treasury`, label: 'Treasury', icon: <TreasuryIcon /> },
    { to: `${base}/navigators`, label: 'Navigators', icon: <NavigatorsIcon /> },
    // Deep-links to specific navigators this DAO has installed (Polls, Budgets, …).
    ...navigatorItems,
    { to: `${base}/settings`, label: 'Settings', icon: <SettingsIcon /> },
  ]
}

// Navigator types that get their own sidebar deep-link, in display order.
// Each links to the first visible navigator of that type for the current DAO.
const NAVIGATOR_MENU_ITEMS: Array<{ type: string; label: string }> = [
  { type: 'SignalNavigator', label: 'Polls' },
  { type: 'BudgetNavigator', label: 'Budgets' },
  { type: 'VestingNavigator', label: 'Vesting' },
  { type: 'SubscriptionNavigator', label: 'Subscriptions' },
]

function SunIcon() {
  return (
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}


export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, theme, setTheme } = useUiStore()
  const daoMatch = useMatch('/dao/:daoId/*')
  const daoId = daoMatch?.params.daoId
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Deep-link sidebar entries for the navigators this DAO has installed. Trust-gated the
  // same way as the Navigators page (default view hides self_asserted read-only navigators);
  // one entry per type, pointing at the first visible navigator of that type.
  const { data: navigators } = useNavigators(daoId)
  const navigatorMenuItems = useMemo<NavItemConfig[]>(() => {
    if (!daoId || !navigators) return []
    const base = `/dao/${daoId}`
    return NAVIGATOR_MENU_ITEMS.flatMap(({ type, label }) => {
      const nav = navigators.find((n) => n.navigator_type === type && isNavigatorVisible(n))
      if (!nav) return []
      return [
        {
          to: `${base}/navigators/${nav.navigator_address}`,
          label,
          icon: <NavigatorMenuIcon type={type} />,
        },
      ]
    })
  }, [daoId, navigators])

  const daoNavItems = daoId ? getDaoNavItems(daoId, navigatorMenuItems) : null

  // Closing the mobile drawer on navigation. Safe on desktop too: the panel stays visible
  // there via `lg:translate-x-0`, independent of `sidebarOpen`.
  const closeDrawer = () => setSidebarOpen(false)

  // Lock body scroll while the mobile drawer is open so the page behind doesn't scroll-bleed.
  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sidebarOpen])

  return (
    <>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-dao-dark-2 border-r border-dao-border
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo / brand */}
          <div className="flex items-center h-16 px-6 border-b border-dao-border">
            <NavLink to="/" className="flex items-center gap-3" onClick={closeDrawer}>
              <img src={isDark ? '/logos/dao_ships_helm_dark_transparent.svg' : '/logos/dao_ships_helm_light_transparent.svg'} alt="DAOShips" className="w-8 h-8" />
              <span className="text-lg font-bold font-display text-dao-text tracking-wide">DAOShips</span>
            </NavLink>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            <SidebarSection items={globalNavItems} onNavigate={closeDrawer} />

            <div className={`transition-all duration-300 overflow-hidden ${daoNavItems ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
              {daoNavItems && (
                <SidebarSection title="Current DAO" items={daoNavItems} onNavigate={closeDrawer} />
              )}
            </div>
          </nav>

          {/* Theme toggle + Footer */}
          <div className="px-4 py-4 border-t border-dao-border space-y-3">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-dao-dark-3 text-dao-text-muted hover:text-dao-text transition-colors"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <p className="text-xs text-dao-text-hint text-center">DAOShips</p>
          </div>
        </div>
      </aside>
    </>
  )
}

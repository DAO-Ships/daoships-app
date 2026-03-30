import { NavLink, useMatch } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore'
import type { ReactNode } from 'react'

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

function SidebarSection({ title, items }: { title?: string; items: NavItemConfig[] }) {
  return (
    <div className="space-y-1">
      {title && (
        <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-dao-text-hint">
          {title}
        </p>
      )}
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={navLinkClass} end={item.end}>
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </div>
  )
}

// ── Icon components (inline SVGs) ───────────────────────────────────────

function HomeIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function ExploreIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function SummonIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}

function OverviewIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function ProposalsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function MembersIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function TreasuryIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function NavigatorsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

// ── Main nav items ──────────────────────────────────────────────────────

const globalNavItems: NavItemConfig[] = [
  { to: '/', label: 'Home', icon: <HomeIcon />, end: true },
  { to: '/explore', label: 'Explore', icon: <ExploreIcon /> },
  { to: '/launch', label: 'Launch', icon: <SummonIcon /> },
]

function getDaoNavItems(daoId: string): NavItemConfig[] {
  const base = `/dao/${daoId}`
  return [
    { to: base, label: 'Overview', icon: <OverviewIcon />, end: true },
    { to: `${base}/proposals`, label: 'Proposals', icon: <ProposalsIcon /> },
    { to: `${base}/members`, label: 'Members', icon: <MembersIcon /> },
    { to: `${base}/treasury`, label: 'Treasury', icon: <TreasuryIcon /> },
    { to: `${base}/navigators`, label: 'Navigators', icon: <NavigatorsIcon /> },
    { to: `${base}/settings`, label: 'Settings', icon: <SettingsIcon /> },
  ]
}

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}


export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, theme, setTheme } = useUiStore()
  const daoMatch = useMatch('/dao/:daoId/*')
  const daoId = daoMatch?.params.daoId
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const daoNavItems = daoId ? getDaoNavItems(daoId) : null

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
            <NavLink to="/" className="flex items-center gap-3">
              <img src={isDark ? '/logos/dao_ships_helm_dark_transparent.svg' : '/logos/dao_ships_helm_light_transparent.svg'} alt="DAOShips" className="w-8 h-8" />
              <span className="text-lg font-bold font-display text-dao-text tracking-wide">DAO Ships</span>
            </NavLink>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            <SidebarSection items={globalNavItems} />

            {daoNavItems && (
              <SidebarSection title="Current DAO" items={daoNavItems} />
            )}
          </nav>

          {/* Theme toggle + Footer */}
          <div className="px-4 py-4 border-t border-dao-border space-y-3">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-dao-dark-3 text-dao-text-muted hover:text-dao-text transition-colors"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <p className="text-xs text-dao-text-hint text-center">DAO Ships</p>
          </div>
        </div>
      </aside>
    </>
  )
}

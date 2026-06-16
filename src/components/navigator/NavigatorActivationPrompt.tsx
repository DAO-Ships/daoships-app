import { Link } from 'react-router-dom'
import type { NavigatorSanctionInfo } from '@/utils/navigatorSanction'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorActivationPrompt - member CTA to propose activating a listed-but-inactive navigator
// ───────────────────────────────────────────────────────────────────────────
// Shown on the navigator detail page when the navigator needs sanctioning/granting/enabling.
// The class-correct action + deep-link come from getNavigatorSanctionInfo. Members get the
// proposal CTA; everyone else gets the explanation without a dead-end button (proposal
// creation requires membership).
// ═══════════════════════════════════════════════════════════════════════════

export function NavigatorActivationPrompt({
  info,
  isMember,
  connected,
}: {
  info: NavigatorSanctionInfo
  isMember: boolean
  connected: boolean
}) {
  const canPropose = connected && isMember && !!info.href

  return (
    <div className="bg-accent-500/5 border border-accent-500/30 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dao-text">{info.title}</p>
          <p className="text-xs text-dao-text-muted mt-0.5">{info.description}</p>
        </div>
        {canPropose && (
          <Link to={info.href!} className="btn-primary text-sm whitespace-nowrap flex-shrink-0">
            {info.ctaLabel}
          </Link>
        )}
      </div>

      {connected && isMember && !info.href && (
        <p className="text-xs text-amber-400 mt-2">
          The proposal link isn't ready yet — wait for the DAO treasury to load, then try again.
        </p>
      )}
      {(!connected || !isMember) && (
        <p className="text-xs text-dao-text-hint mt-2">
          {!connected
            ? 'Connect your wallet and join the DAO to propose activating it.'
            : 'Only DAO members can propose activating it.'}
        </p>
      )}
    </div>
  )
}

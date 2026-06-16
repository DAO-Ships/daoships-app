import { useState } from 'react'
import { Link } from 'react-router-dom'
import { quais } from 'quais'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { parseTokenAmount } from '@/utils/format'
import {
  buildNavigatorPauseAction,
  buildNavigatorUnpauseAction,
  buildWithdrawStuckETHAction,
  buildWithdrawStuckTokensAction,
  buildNavigatorAdminHref,
} from '@/utils/navigatorAdminProposals'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorAdminActions - governance pause/unpause + stuck-fund recovery deep-links
// ───────────────────────────────────────────────────────────────────────────
// Shared across the membership navigators (Onboarder/ERC20Tribute/NFTGated). These are
// governance/avatar-only, so each links into the custom-action proposal flow. `withdraw`
// selects the recovery form: 'eth' (Onboarder), 'tokens' (ERC20Tribute), or 'none' (NFTGated).
//
// These actions only build a governance proposal, so they require DAO membership: a
// non-member's proposal can't self-sponsor or pass on-chain. We gate the controls behind
// `isMember` (shares/loot holder) rather than showing dead-end buttons to any connected wallet.
// ═══════════════════════════════════════════════════════════════════════════

export function NavigatorAdminActions({
  daoId,
  navigatorAddress,
  isPaused,
  connected,
  isMember,
  withdraw = 'none',
}: {
  daoId: string
  navigatorAddress: string
  isPaused: boolean
  connected: boolean
  isMember: boolean
  withdraw?: 'eth' | 'tokens' | 'none'
}) {
  const [showRecover, setShowRecover] = useState(false)
  if (!connected) return null

  if (!isMember) {
    return (
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Admin (governance)</h3>}>
        <p className="text-xs text-dao-text-hint">
          Only DAO members can propose governance actions for this navigator. Join the DAO to
          propose pausing, unpausing, or fund recovery.
        </p>
      </Card>
    )
  }

  const pauseHref = buildNavigatorAdminHref(
    daoId,
    isPaused ? buildNavigatorUnpauseAction(navigatorAddress) : buildNavigatorPauseAction(navigatorAddress),
  )

  return (
    <Card header={<h3 className="text-sm font-semibold text-dao-text">Admin (governance)</h3>}>
      <p className="text-xs text-dao-text-hint mb-3">
        These actions run as governance proposals — the DAO must pass them. Pausing halts onboarding
        without removing the navigator.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to={pauseHref} className="btn-secondary text-sm">
          {isPaused ? 'Propose Unpause' : 'Propose Pause'}
        </Link>
        {withdraw !== 'none' && (
          <Button variant="secondary" size="sm" onClick={() => setShowRecover((v) => !v)}>
            {showRecover ? 'Cancel' : withdraw === 'eth' ? 'Recover Stuck QUAI' : 'Recover Mis-sent Tokens'}
          </Button>
        )}
      </div>
      {showRecover && withdraw !== 'none' && (
        <div className="mt-3">
          <RecoverForm daoId={daoId} navigatorAddress={navigatorAddress} kind={withdraw} />
        </div>
      )}
    </Card>
  )
}

function RecoverForm({
  daoId,
  navigatorAddress,
  kind,
}: {
  daoId: string
  navigatorAddress: string
  kind: 'eth' | 'tokens'
}) {
  const [token, setToken] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')

  const tokenValid = kind === 'eth' || (token.startsWith('0x') && token.length === 42)
  const toValid = to.startsWith('0x') && to.length === 42
  const amountWei = (() => { try { return amount ? parseTokenAmount(amount) : 0n } catch { return 0n } })()
  const valid = tokenValid && toValid && amountWei > 0n

  const href = valid
    ? buildNavigatorAdminHref(
        daoId,
        kind === 'eth'
          ? buildWithdrawStuckETHAction(navigatorAddress, quais.getAddress(to), amountWei)
          : buildWithdrawStuckTokensAction(navigatorAddress, quais.getAddress(token), quais.getAddress(to), amountWei),
      )
    : '#'

  return (
    <div className="space-y-2">
      <p className="text-xs text-dao-text-hint">
        {kind === 'eth'
          ? 'Recover native QUAI stuck in the navigator (amount in whole QUAI).'
          : 'Recover ERC-20 tokens mis-sent to the navigator (amount in whole tokens, 18 decimals).'}
      </p>
      {kind === 'tokens' && (
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token address 0x…" className="input w-full font-mono text-sm" />
      )}
      <div className="flex gap-2">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient 0x…" className="input flex-1 font-mono text-sm" />
        <input value={amount} onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setAmount(e.target.value) }} placeholder="Amount" className="input w-28 font-mono text-sm" inputMode="decimal" />
      </div>
      <div className="flex justify-end">
        <Link to={href} className={`btn-primary text-sm ${valid ? '' : 'pointer-events-none opacity-50'}`}>
          Propose →
        </Link>
      </div>
    </div>
  )
}

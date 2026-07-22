import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { quais } from 'quais'
import type { NavigatorPluginProps } from './index'
import { mapContractError } from './pluginErrors'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useMember } from '@/hooks/useMember'
import { useTokenMetadata } from '@/hooks/useTokenMetadata'
import {
  useSubscriptionMembers,
  useSubscriptionPayments,
  useSubscriptionCollections,
} from '@/hooks/useSubscriptions'
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions'
import { navigatorService } from '@/services/core/NavigatorService'
import type { SubscriptionNavigatorConfig } from '@/services/core/NavigatorService'
import type { SubscriptionMemberRow } from '@/types'
import { computeSubscriptionStatus } from '@/types'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { MemberIdentity } from '@/components/member/MemberIdentity'
import { useMemberProfiles, type MemberProfile } from '@/hooks/useMemberProfile'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { formatDuration, formatCountdown } from '@/utils/time'
import { safeBigInt } from '@/utils/bigint'
import { addressesEqual } from '@/services/utils/AddressUtils'
import {
  buildEnrollAction,
  buildEnrollBatchAction,
  buildWithdrawStuckTokensAction,
  buildSubscriptionPauseAction,
  buildSubscriptionUnpauseAction,
  buildSubscriptionProposalHref,
} from '@/utils/subscriptionProposals'

// ═══════════════════════════════════════════════════════════════════════════
// SubscriptionPlugin - Recurring membership dues (MANAGER navigator)
// ───────────────────────────────────────────────────────────────────────────
// Members pull-pay periodic dues (a token menu) to stay `current`; past a grace window a
// member is `delinquent` and anyone may collectFee them (shares → loot or burned, + a loot
// keeper reward). Config is immutable. enroll/pause are avatar-only → proposal deep-links.
// ═══════════════════════════════════════════════════════════════════════════

const ERROR_MAP: Record<string, string> = {
  IncorrectPayment: 'Send the exact dues amount (no overpayment).',
  InsufficientPayment: 'Payment fell short — fee-on-transfer tokens are not supported.',
  TokenNotAccepted: 'That token is not on the fee menu.',
  IsPaused: 'Subscriptions are currently paused.',
  NotDelinquent: 'This member is not past their grace window yet.',
  NoSharesToBurn: 'This member has no shares to collect.',
  ZeroPeriods: 'Pay for at least one period.',
  NotAuthorized: 'Only the DAO (via proposal) can do that.',
}

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('sponsorThreshold') || msg.includes('SponsorThreshold')) {
    return "Can't collect: removing this member would drop shares below the DAO's sponsor threshold."
  }
  return mapContractError(err, ERROR_MAP)
}

const STATUS_STYLES: Record<string, string> = {
  not_enrolled: 'bg-dao-surface/60 text-dao-text-hint',
  current: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  grace: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  delinquent: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

export function SubscriptionPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
  useRealtimeSubscriptions(daoId)
  const { data: configResult, isLoading: configLoading } = useNavigatorConfig(
    navigator.is_active ? navigator.navigator_address : undefined,
  )

  if (configLoading) {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Loading navigator configuration...</p>
      </Card>
    )
  }

  if (!configResult || configResult.type !== 'SubscriptionNavigator') {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Unable to load Subscription configuration.</p>
      </Card>
    )
  }

  return (
    <SubscriptionInteraction
      navigatorAddress={navigator.navigator_address}
      config={configResult.config}
      permission={navigator.permission}
      indexerPaused={navigator.paused}
      daoId={daoId}
      userAddress={userAddress}
      connected={connected}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionInteraction({
  navigatorAddress,
  config,
  permission,
  indexerPaused,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: SubscriptionNavigatorConfig
  permission: number
  indexerPaused: boolean
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const { data: members, isLoading: membersLoading } = useSubscriptionMembers(daoId, navigatorAddress)
  const { data: collections } = useSubscriptionCollections(navigatorAddress)
  // Member profiles (name/avatar) for the roster — one batched query, keyed by lowercase address.
  const { data: profiles } = useMemberProfiles(daoId)

  // Grant-MANAGER / enroll / pause / recover run as governance proposals → require DAO
  // membership. Paying dues and the permissionless keeper collect stay open to anyone.
  const { data: memberData } = useMember(daoId, userAddress ?? undefined)
  const isMember = memberData ? (safeBigInt(memberData.shares) > 0n || safeBigInt(memberData.loot) > 0n) : false

  const hasManager = (permission & 2) !== 0
  const isPaused = indexerPaused || config.paused
  const graceSec = Number(config.graceDuration)
  const periodSec = Number(config.periodDuration)

  const myRow = userAddress
    ? (members ?? []).find((m) => addressesEqual(m.member, userAddress)) ?? null
    : null

  const delinquent = useMemo(
    () => (members ?? []).filter((m) => computeSubscriptionStatus(m, graceSec) === 'delinquent'),
    [members, graceSec],
  )

  return (
    <div className="space-y-5">
      {/* MANAGER permission warning */}
      {!hasManager && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400 font-medium">This navigator does not hold the MANAGER permission.</p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            Dues and collection can't touch the cap table until the DAO grants it MANAGER (2) via a
            navigator proposal. Use the activation prompt at the top of this page to propose it.
          </p>
        </div>
      )}

      {isPaused && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400 font-medium">Subscriptions are paused — no payments or collections right now.</p>
        </div>
      )}

      {/* Config / fee menu */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Subscription Terms</h3>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Period</p>
            <p className="font-mono text-dao-text-secondary">{formatDuration(periodSec)}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Grace</p>
            <p className="font-mono text-dao-text-secondary">{graceSec > 0 ? formatDuration(graceSec) : 'none'}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Keeper reward</p>
            <p className="font-mono text-dao-text-secondary">{(Number(config.collectorRewardBps) / 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">On lapse</p>
            <p className="font-medium text-dao-text-secondary">{config.burnOnCollect ? 'Shares burned' : 'Shares → loot'}</p>
          </div>
        </div>
        <div className="pt-3 border-t border-dao-border">
          <p className="text-dao-text-hint text-xs mb-1.5">Accepted fees (per period)</p>
          <div className="space-y-1">
            {config.tokens.map((t) => (
              <div key={t.address} className="flex items-center justify-between text-sm">
                <span className="text-dao-text-secondary">{t.symbol}{t.isNative && ' (native)'}</span>
                <span className="font-mono text-dao-text-secondary">{formatTokenAmount(t.feePerPeriod, t.decimals)} {t.symbol}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-dao-text-hint mt-3 pt-3 border-t border-dao-border">
          Terms are <strong>immutable</strong>. Changing fees, tokens, period, grace, or enforcement requires
          deploying a new Subscription navigator and re-registering.
        </p>
      </Card>

      {/* Your subscription */}
      {connected && userAddress && !isPaused && (
        <YourSubscription
          navigatorAddress={navigatorAddress}
          config={config}
          member={myRow}
          userAddress={userAddress}
        />
      )}

      {/* Collect lapsed members (keeper) */}
      {connected && !isPaused && delinquent.length > 0 && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Collect Lapsed Members</h3>}>
          <p className="text-xs text-dao-text-hint mb-3">
            These members are past their grace window. Anyone may collect them — you earn a{' '}
            {(Number(config.collectorRewardBps) / 100).toFixed(2)}% loot reward on the shares removed.
            A member with 0 shares (or one whose removal would breach the sponsor threshold) can't be collected.
          </p>
          <div className="space-y-2">
            {delinquent.map((m) => (
              <CollectRow key={m.id} member={m} navigatorAddress={navigatorAddress} connected={connected} profile={profiles?.get(m.member.toLowerCase())} />
            ))}
          </div>
        </Card>
      )}

      {/* Members roster */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Subscribers</h3>}>
        {membersLoading ? (
          <p className="text-sm text-dao-text-hint">Loading subscribers…</p>
        ) : !members || members.length === 0 ? (
          <p className="text-sm text-dao-text-hint py-2">No subscribers yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const status = computeSubscriptionStatus(m, graceSec)
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <MemberIdentity address={m.member} profile={profiles?.get(m.member.toLowerCase())} />
                  <div className="flex items-center gap-3">
                    {status !== 'not_enrolled' && (
                      <span className="text-xs text-dao-text-hint font-mono">
                        {status === 'current' ? `renews ${new Date(m.paid_through * 1000).toLocaleDateString()}` : `due ${new Date(m.paid_through * 1000).toLocaleDateString()}`}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[status]}`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Collection feed */}
      {collections && collections.length > 0 && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Collection History</h3>}>
          <div className="space-y-2">
            {collections.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <AddressDisplay address={c.member} />
                  <span className="text-dao-text-hint">{c.burned ? 'burned' : '→ loot'}</span>
                </div>
                <span className="font-mono text-dao-text-hint">
                  −{formatTokenAmount(c.shares_removed)} shares
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Governance (members only — these create proposals) */}
      {connected && hasManager && isMember && (
        <Card header={<h3 className="text-sm font-semibold text-dao-text">Manage</h3>}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Link
                to={buildSubscriptionProposalHref(daoId, isPaused ? buildSubscriptionUnpauseAction(navigatorAddress) : buildSubscriptionPauseAction(navigatorAddress))}
                className="btn-secondary text-sm"
              >
                {isPaused ? 'Propose Unpause' : 'Propose Pause'}
              </Link>
            </div>
            <EnrollButton daoId={daoId} navigatorAddress={navigatorAddress} />
            <WithdrawStuckTokensButton daoId={daoId} navigatorAddress={navigatorAddress} />
          </div>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// YourSubscription - the connected member's status + pay form
// ═══════════════════════════════════════════════════════════════════════════

function YourSubscription({
  navigatorAddress,
  config,
  member,
  userAddress,
}: {
  navigatorAddress: string
  config: SubscriptionNavigatorConfig
  member: SubscriptionMemberRow | null
  userAddress: string
}) {
  const graceSec = Number(config.graceDuration)
  const periodSec = Number(config.periodDuration)
  const status = computeSubscriptionStatus(member ?? { paid_through: 0 }, graceSec)

  const { data: payments } = useSubscriptionPayments(navigatorAddress, userAddress)

  const [tokenAddr, setTokenAddr] = useState(config.tokens[0]?.address ?? '')
  const [periods, setPeriods] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const token = config.tokens.find((t) => t.address === tokenAddr) ?? config.tokens[0]
  const periodsNum = (() => { const n = parseInt(periods || '0', 10); return Number.isFinite(n) && n > 0 ? BigInt(n) : 0n })()
  const estCost = token ? token.feePerPeriod * periodsNum : 0n

  // "You owe N periods to become current" for grace/delinquent members (debt model).
  const owedPeriods = useMemo(() => {
    if (!member || member.paid_through === 0 || periodSec <= 0) return 0
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec <= member.paid_through) return 0
    return Math.ceil((nowSec - member.paid_through) / periodSec)
  }, [member, periodSec])

  const [payForOther, setPayForOther] = useState(false)
  const [beneficiary, setBeneficiary] = useState('')
  const beneficiaryValid = !payForOther || (beneficiary.startsWith('0x') && beneficiary.length === 42)

  const handlePay = useCallback(async () => {
    setError(null)
    setSuccess(false)
    if (periodsNum <= 0n || !token) { setError('Enter at least one period.'); return }
    if (payForOther && !(beneficiary.startsWith('0x') && beneficiary.length === 42)) {
      setError('Enter a valid member address to sponsor.'); return
    }
    setBusy(true)
    try {
      if (payForOther) {
        await navigatorService.subscriptionPayFeeFor(navigatorAddress, beneficiary.trim(), periodsNum, token.address)
      } else {
        await navigatorService.subscriptionPayFee(navigatorAddress, periodsNum, token.address)
      }
      setSuccess(true)
      setBeneficiary('')
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [navigatorAddress, periodsNum, token, payForOther, beneficiary])

  return (
    <Card header={<h3 className="text-sm font-semibold text-dao-text">Your Subscription</h3>}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[status]}`}>
          {status.replace('_', ' ')}
        </span>
        {status === 'current' && member && (
          <span className="text-xs text-dao-text-hint">Renews in {formatCountdown(member.paid_through)}</span>
        )}
        {status === 'grace' && member && (
          <span className="text-xs text-amber-400">Overdue — collectible after {new Date((member.paid_through + graceSec) * 1000).toLocaleString()}</span>
        )}
        {status === 'delinquent' && (
          <span className="text-xs text-red-400">Collectible now — pay to stop a keeper removing your shares</span>
        )}
      </div>

      {status === 'not_enrolled' && (
        <p className="text-xs text-dao-text-hint mb-3">
          You're not a subscriber. Your first payment enrolls you automatically.
        </p>
      )}
      {owedPeriods > 1 && (
        <p className="text-xs text-amber-400 mb-3">
          You owe ~{owedPeriods} periods to become current (dues extend from where you lapsed, not from now).
        </p>
      )}

      {config.tokens.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-dao-text-secondary mb-1">Pay with</label>
              <select value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} className="input w-full text-sm" disabled={busy}>
                {config.tokens.map((t) => (
                  <option key={t.address} value={t.address}>{t.symbol}{t.isNative ? ' (native)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-28">
              <label className="block text-xs font-medium text-dao-text-secondary mb-1">Periods</label>
              <input
                value={periods}
                onChange={(e) => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) { setPeriods(e.target.value); setError(null); setSuccess(false) } }}
                className="input w-full font-mono text-sm"
                inputMode="numeric"
                disabled={busy}
              />
            </div>
            <Button variant="primary" size="sm" onClick={handlePay} loading={busy} disabled={periodsNum <= 0n || !beneficiaryValid}>
              {payForOther ? 'Sponsor' : status === 'not_enrolled' ? 'Subscribe' : 'Pay'}
            </Button>
          </div>
          {/* Pay for another member (gift/sponsor) */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={payForOther} onChange={(e) => { setPayForOther(e.target.checked); setError(null) }} disabled={busy}
              className="w-3.5 h-3.5 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0" />
            <span className="text-xs text-dao-text-secondary">Pay for another member (sponsor their dues)</span>
          </label>
          {payForOther && (
            <input
              value={beneficiary}
              onChange={(e) => { setBeneficiary(e.target.value); setError(null) }}
              placeholder="Member address 0x… (you fund it; their membership extends)"
              className="input w-full font-mono text-sm"
              disabled={busy}
            />
          )}
        </div>
      )}
      {token && periodsNum > 0n && (
        <p className="text-xs text-dao-text-hint mt-2">
          Total: <span className="font-mono text-dao-text-secondary">{formatTokenAmount(estCost, token.decimals)} {token.symbol}</span>
          {token.isNative ? ' (sent as exact native value)' : ' (you will approve the token first)'}
        </p>
      )}
      {error && <p className="text-xs text-red-400 mt-2" role="alert">{error}</p>}
      {success && <p className="text-xs text-emerald-400 mt-2" role="status">Payment confirmed — your membership is extended.</p>}

      {payments && payments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dao-border">
          <p className="text-xs font-medium text-dao-text-secondary mb-1.5">Your payments</p>
          <div className="space-y-1">
            {payments.slice(0, 5).map((p) => {
              const t = config.tokens.find((x) => addressesEqual(x.address, p.token))
              return (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-dao-text-hint">{p.periods} period{p.periods === '1' ? '' : 's'}{!addressesEqual(p.payer, p.member) && ' (gifted)'}</span>
                  <span className="font-mono text-dao-text-secondary">{formatTokenAmount(p.amount, t?.decimals ?? 18)} {t?.symbol ?? ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CollectRow - one delinquent member with a permissionless Collect action
// ═══════════════════════════════════════════════════════════════════════════

function CollectRow({
  member,
  navigatorAddress,
  connected,
  profile,
}: {
  member: SubscriptionMemberRow
  navigatorAddress: string
  connected: boolean
  profile?: MemberProfile | null
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleCollect = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      // Authoritative on-chain re-check (the indexer can lag a just-made payment).
      const stillDelinquent = await navigatorService.subscriptionIsDelinquent(navigatorAddress, member.member)
      if (!stillDelinquent) { setError('This member is no longer delinquent (they may have just paid).'); return }
      await navigatorService.subscriptionCollectFee(navigatorAddress, member.member)
      setDone(true)
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [navigatorAddress, member.member])

  if (done) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <MemberIdentity address={member.member} profile={profile} avatarSize={6} />
        <span className="text-emerald-400">Collected</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-dao-dark-3 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <MemberIdentity address={member.member} profile={profile} avatarSize={6} />
        <Button variant="secondary" size="sm" onClick={handleCollect} loading={busy} disabled={!connected}>
          Collect
        </Button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1.5" role="alert">{error}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EnrollButton - governance enroll of one or many members (deep-link).
// One address → enroll(); multiple → enrollBatch() (skips already-enrolled).
// ═══════════════════════════════════════════════════════════════════════════

function EnrollButton({ daoId, navigatorAddress }: { daoId: string; navigatorAddress: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const parsed = useMemo(() => {
    const addrs = text.split(/[\s,]+/).map((a) => a.trim()).filter(Boolean)
    const invalid = addrs.find((a) => !(a.startsWith('0x') && a.length === 42))
    return { addrs, invalid }
  }, [text])

  const valid = parsed.addrs.length > 0 && !parsed.invalid
  const href = valid
    ? buildSubscriptionProposalHref(
        daoId,
        parsed.addrs.length === 1
          ? buildEnrollAction(navigatorAddress, quais.getAddress(parsed.addrs[0]))
          : buildEnrollBatchAction(navigatorAddress, parsed.addrs.map((a) => quais.getAddress(a))),
      )
    : '#'

  if (!open) {
    return <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Enroll Members</Button>
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Member addresses — one per line or comma-separated (each gets 1 free period; already-enrolled are skipped)"
        className="input w-full min-h-[60px] resize-y font-mono text-sm"
        rows={2}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-dao-text-hint">
          {parsed.invalid ? <span className="text-red-400">Invalid address: {parsed.invalid.slice(0, 12)}…</span>
            : parsed.addrs.length > 0 ? `${parsed.addrs.length} member${parsed.addrs.length === 1 ? '' : 's'}`
            : 'Enter at least one address.'}
        </span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-dao-text-hint hover:text-dao-text">Cancel</button>
          <Link to={href} className={`btn-primary text-sm whitespace-nowrap ${valid ? '' : 'pointer-events-none opacity-50'}`}>
            Propose →
          </Link>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// WithdrawStuckTokensButton - recover mis-sent ERC-20 via governance (deep-link)
// ═══════════════════════════════════════════════════════════════════════════

function WithdrawStuckTokensButton({ daoId, navigatorAddress }: { daoId: string; navigatorAddress: string }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')

  const tokenValid = token.startsWith('0x') && token.length === 42
  const toValid = to.startsWith('0x') && to.length === 42
  // The recovered token is arbitrary, so its decimals must be read on-chain rather
  // than assumed to be 18.
  const { data: recoverTokenMeta, isLoading: recoverDecimalsLoading } = useTokenMetadata(
    tokenValid ? token : undefined,
  )
  const recoverDecimals = recoverTokenMeta?.decimals ?? null
  const amountWei = (() => {
    if (recoverDecimals === null) return 0n
    try {
      return amount ? parseTokenAmount(amount, recoverDecimals) : 0n
    } catch (err) {
      // Malformed user input parses to 0n (button stays disabled). A ReferenceError
      // or TypeError is a programmer bug, not bad input — never swallow it.
      if (err instanceof ReferenceError || err instanceof TypeError) throw err
      return 0n
    }
  })()
  const valid = tokenValid && toValid && recoverDecimals !== null && amountWei > 0n

  if (!open) {
    return <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Recover Mis-sent Tokens</Button>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-dao-text-hint">Recover ERC-20 tokens accidentally sent to the navigator (amount in whole tokens, 18 decimals).</p>
      <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token address 0x…" className="input w-full font-mono text-sm" />
      <div className="flex gap-2">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient 0x…" className="input flex-1 font-mono text-sm" />
        <input value={amount} onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setAmount(e.target.value) }} placeholder="Amount" className="input w-28 font-mono text-sm" inputMode="decimal" />
        {tokenValid && recoverDecimals === null && (
          <span className="text-2xs text-dao-text-hint self-center">
            {recoverDecimalsLoading ? 'Reading token decimals…' : 'Could not read token decimals'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-dao-text-hint hover:text-dao-text">Cancel</button>
        <Link
          to={valid ? buildSubscriptionProposalHref(daoId, buildWithdrawStuckTokensAction(navigatorAddress, quais.getAddress(token), quais.getAddress(to), amountWei)) : '#'}
          className={`btn-primary text-sm whitespace-nowrap ${valid ? '' : 'pointer-events-none opacity-50'}`}
        >
          Propose →
        </Link>
      </div>
    </div>
  )
}

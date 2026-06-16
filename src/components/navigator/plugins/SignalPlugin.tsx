import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NavigatorPluginProps } from './index'
import { useNavigatorConfig } from '@/hooks/useNavigatorConfig'
import { useSignalPolls } from '@/hooks/useSignalPolls'
import { navigatorService } from '@/services/core/NavigatorService'
import { navigatorIndexerService } from '@/services/indexer/NavigatorIndexerService'
import { daoService } from '@/services/DaoService'
import { posterService } from '@/services/core/PosterService'
import type { SignalNavigatorConfig } from '@/services/core/NavigatorService'
import type { SignalPollRow } from '@/types'
import { computeSignalPollStatus, signalOptionLabel } from '@/types'
import { Card } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount } from '@/utils/format'
import { formatDurationInput } from '@/utils/time'
import { safeBigInt } from '@/utils/bigint'
import { addressesEqual } from '@/services/utils/AddressUtils'
import { validateSignalPollLabels } from '@/utils/posterSchemas'
import { isValidUrl, resolveUrl } from '@/utils/url'

// ═══════════════════════════════════════════════════════════════════════════
// SignalPlugin - Create / vote / view non-binding share-weighted polls
// ═══════════════════════════════════════════════════════════════════════════

/** SignalNavigator custom errors → user-friendly copy. */
const ERROR_MAP: Record<string, string> = {
  InsufficientShares: 'You need more voting power to open a poll.',
  NoVotingPower: "You had no shares at the snapshot — you can't vote in this poll.",
  AlreadyVoted: "You've already voted in this poll.",
  PollNotStarted: "Voting hasn't opened yet.",
  PollHasEnded: 'Voting has closed.',
  PollIsCancelled: 'This poll was cancelled.',
  InvalidOption: 'Pick a valid option.',
  InvalidOptionCount: 'Polls must have between 2 and 10 options.',
  InvalidDuration: 'The voting duration is outside the allowed range.',
  InvalidStartTime: 'The scheduled start time is outside the allowed window.',
  NotAuthorized: 'Only the creator (before start) or the DAO can cancel.',
}

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

const DAY = 86400

export function SignalPlugin({ navigator, daoId, userAddress, connected }: NavigatorPluginProps) {
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

  if (!configResult || configResult.type !== 'SignalNavigator') {
    return (
      <Card>
        <p className="text-sm text-dao-text-hint">Unable to load Signal Navigator configuration.</p>
      </Card>
    )
  }

  return (
    <SignalInteraction
      navigatorAddress={navigator.navigator_address}
      config={configResult.config}
      trustStatus={navigator.trust_status}
      daoId={daoId}
      userAddress={userAddress}
      connected={connected}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function SignalInteraction({
  navigatorAddress,
  config,
  trustStatus,
  daoId,
  userAddress,
  connected,
}: {
  navigatorAddress: string
  config: SignalNavigatorConfig
  trustStatus: string
  daoId: string
  userAddress: string | null
  connected: boolean
}) {
  const queryClient = useQueryClient()
  const { data: polls, isLoading: pollsLoading } = useSignalPolls(daoId, navigatorAddress)

  // Creator gate: current voting power vs minSharesToCreatePoll (contract is the backstop).
  const { data: votingPower } = useQuery({
    queryKey: ['currentVotes', daoId, userAddress],
    queryFn: () => daoService.getCurrentVotes(daoId, userAddress!),
    enabled: connected && !!userAddress,
    staleTime: 15_000,
  })

  const canCreate = votingPower !== undefined && votingPower >= config.minSharesToCreatePoll
  const isSanctioned = trustStatus === 'sanctioned'

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['signalPolls', daoId, navigatorAddress.toLowerCase()] })
  }, [queryClient, daoId, navigatorAddress])

  return (
    <div className="space-y-5">
      {/* Sanction status banner */}
      {!isSanctioned && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400 font-medium">This navigator is not sanctioned by the DAO.</p>
          <p className="text-xs text-dao-text-muted mt-0.5">
            Polls are queryable on-chain but won't appear here until the DAO sanctions this navigator via a
            governance proposal. Results below may be empty by design.
          </p>
        </div>
      )}

      {/* Config summary */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Poll Settings</h3>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Min power to create</p>
            <p className="font-mono text-dao-text-secondary">
              {config.minSharesToCreatePoll === 0n ? 'Any' : formatTokenAmount(config.minSharesToCreatePoll)}
            </p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Min duration</p>
            <p className="font-mono text-dao-text-secondary">{formatDuration(config.minDuration)}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Max duration</p>
            <p className="font-mono text-dao-text-secondary">{formatDuration(config.maxDuration)}</p>
          </div>
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Scheduling</p>
            <p className="font-mono text-dao-text-secondary">
              {config.maxStartDelay === 0n ? 'Immediate only' : `Up to ${formatDuration(config.maxStartDelay)} ahead`}
            </p>
          </div>
        </div>
        <p className="text-xs text-dao-text-hint mt-3 pt-3 border-t border-dao-border">
          Polls are non-binding temperature checks. Voting power is your <strong>share</strong> balance
          (loot excluded), frozen at poll start — shares acquired after a poll opens carry no weight.
        </p>
      </Card>

      {/* Create poll */}
      {connected && (
        <CreatePollForm
          daoId={daoId}
          navigatorAddress={navigatorAddress}
          config={config}
          canCreate={canCreate}
          votingPower={votingPower}
          onCreated={refresh}
        />
      )}

      {/* Poll list */}
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Polls</h3>}>
        {pollsLoading ? (
          <p className="text-sm text-dao-text-hint">Loading polls…</p>
        ) : !polls || polls.length === 0 ? (
          <p className="text-sm text-dao-text-hint py-2">
            {isSanctioned ? 'No polls yet.' : 'No polls to show (navigator not sanctioned).'}
          </p>
        ) : (
          <div className="space-y-4">
            {polls.map((poll) => (
              <PollRow
                key={poll.id}
                poll={poll}
                daoId={daoId}
                navigatorAddress={navigatorAddress}
                userAddress={userAddress}
                connected={connected}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Poll option labels (daoships.signal.poll) — posted directly by the poll creator
// ───────────────────────────────────────────────────────────────────────────
// Labels live off-chain in a Poster post (the contract stores only optionCount). This is the
// REQUIRED second transaction after createPoll, and the same call edits labels later. The
// indexer accepts it only from the creator while the poll is Pending/Active, and only when
// options.length matches the on-chain optionCount — so callers must pin the count.
// ═══════════════════════════════════════════════════════════════════════════

async function submitPollLabels(
  daoId: string,
  navigatorAddress: string,
  pollId: number,
  meta: { options: string[]; description?: string; discussionUrl?: string },
): Promise<void> {
  const options = meta.options.map((o) => o.trim())
  const description = meta.description?.trim() || undefined
  const discussionUrl = meta.discussionUrl?.trim() || undefined
  const { valid, errors } = validateSignalPollLabels({ options, description, discussionUrl })
  if (!valid) throw new Error(errors[0] ?? 'Invalid poll options.')
  // daoAddress MUST equal the navigator's DAOShip — daoId IS that address in this app.
  await posterService.postSignalPollLabels({
    daoAddress: daoId,
    navigatorAddress,
    pollId,
    options,
    description,
    discussionUrl,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// CreatePollForm
// ═══════════════════════════════════════════════════════════════════════════

function CreatePollForm({
  daoId,
  navigatorAddress,
  config,
  canCreate,
  votingPower,
  onCreated,
}: {
  daoId: string
  navigatorAddress: string
  config: SignalNavigatorConfig
  canCreate: boolean
  votingPower: bigint | undefined
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [description, setDescription] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [schedule, setSchedule] = useState(false)
  const [startAt, setStartAt] = useState('')
  const [durationDays, setDurationDays] = useState(() => secondsToDaysString(config.minDuration))
  // Two-tx flow: createPoll (TX1) then post labels (TX2). If TX1 succeeds but TX2 fails we keep
  // the recovered pollId so the creator can retry the labels post WITHOUT recreating the poll.
  const [phase, setPhase] = useState<'idle' | 'creating' | 'posting'>('idle')
  const [createdPollId, setCreatedPollId] = useState<bigint | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSchedule = config.maxStartDelay > 0n
  const busy = phase !== 'idle'

  const reset = () => {
    setQuestion(''); setOptions(['', '']); setDescription(''); setDiscussionUrl('')
    setSchedule(false); setStartAt(''); setDurationDays(secondsToDaysString(config.minDuration))
    setPhase('idle'); setCreatedPollId(null); setError(null); setOpen(false)
  }

  const setOptionAt = (i: number, val: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)))
  const addOption = () => setOptions((prev) => (prev.length < 10 ? [...prev, ''] : prev))
  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev))

  // Validate everything up front so we never create a poll we then can't label.
  const validateAndBuild = (): { startTime: bigint; duration: bigint } | null => {
    setError(null)
    if (!question.trim()) { setError('Enter a poll question.'); return null }

    const labelCheck = validateSignalPollLabels({
      options: options.map((o) => o.trim()),
      description: description.trim() || undefined,
      discussionUrl: discussionUrl.trim() || undefined,
    })
    if (!labelCheck.valid) { setError(labelCheck.errors[0]); return null }

    const duration = BigInt(Math.floor(parseFloat(durationDays || '0') * DAY))
    if (duration < config.minDuration || duration > config.maxDuration) {
      setError(`Duration must be between ${formatDuration(config.minDuration)} and ${formatDuration(config.maxDuration)}.`)
      return null
    }

    let startTime = 0n
    if (schedule && canSchedule) {
      if (!startAt) { setError('Pick a start time, or switch to "Open immediately".'); return null }
      const startSec = Math.floor(new Date(startAt).getTime() / 1000)
      const nowSec = Math.floor(Date.now() / 1000)
      if (startSec < nowSec) { setError('Start time is in the past.'); return null }
      if (BigInt(startSec - nowSec) > config.maxStartDelay) {
        setError(`Start time can be at most ${formatDuration(config.maxStartDelay)} from now.`)
        return null
      }
      startTime = BigInt(startSec)
    }
    return { startTime, duration }
  }

  const handleCreate = async () => {
    const built = validateAndBuild()
    if (!built) return

    // TX1 — create the poll on-chain (optionCount = number of labels entered).
    setPhase('creating')
    let pollId: bigint
    try {
      pollId = await navigatorService.signalCreatePoll(
        navigatorAddress, question.trim(), options.length, built.startTime, built.duration,
      )
    } catch (e) {
      setError(mapError(e)); setPhase('idle'); return
    }
    setCreatedPollId(pollId)

    // TX2 — post the option labels. On failure the poll already exists → keep pollId for retry.
    setPhase('posting')
    try {
      await submitPollLabels(daoId, navigatorAddress, Number(pollId), { options, description, discussionUrl })
    } catch (e) {
      setError(mapError(e)); setPhase('idle'); return
    }
    reset(); onCreated()
  }

  const handleRetryLabels = async () => {
    if (createdPollId === null) return
    setError(null); setPhase('posting')
    try {
      await submitPollLabels(daoId, navigatorAddress, Number(createdPollId), { options, description, discussionUrl })
      reset(); onCreated()
    } catch (e) {
      setError(mapError(e)); setPhase('idle')
    }
  }

  const handleSkipLabels = () => { reset(); onCreated() }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        {!canCreate && votingPower !== undefined && (
          <p className="text-xs text-dao-text-hint">
            You need {formatTokenAmount(config.minSharesToCreatePoll)} voting power to open a poll.
          </p>
        )}
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setOpen(true)} disabled={!canCreate}>
          + Create Poll
        </Button>
      </div>
    )
  }

  // TX1 succeeded but TX2 (labels) failed — the poll is live but unlabeled. Offer retry / skip.
  if (createdPollId !== null) {
    return (
      <Card header={<h3 className="text-sm font-semibold text-dao-text">Finish your poll</h3>}>
        <div className="space-y-3">
          <p className="text-sm text-amber-400 font-medium">
            Your poll was created, but posting the options didn’t go through.
          </p>
          <p className="text-xs text-dao-text-hint">
            The poll is live and shows numbered options (Option 1–{options.length}) until you post the
            labels. That’s a separate transaction — retry it now, or skip and add them later from the
            poll’s “Edit options &amp; details”.
          </p>
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleSkipLabels} disabled={busy}>
              Skip for now
            </Button>
            <Button variant="primary" size="sm" onClick={handleRetryLabels} loading={phase === 'posting'}>
              Retry posting options
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card header={<h3 className="text-sm font-semibold text-dao-text">Create a Poll</h3>}>
      <div className="space-y-4">
        <div>
          <label htmlFor="signal-question" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Question
          </label>
          <input
            id="signal-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which color for the v2 brand?"
            className="input w-full"
            maxLength={280}
            disabled={busy}
          />
        </div>

        {/* Options — the number of labels IS the on-chain optionCount (2–10). */}
        <div>
          <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Options</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-dao-text-hint w-5 flex-shrink-0">{i + 1}.</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => setOptionAt(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="input flex-1"
                  maxLength={200}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  disabled={busy || options.length <= 2}
                  className="text-dao-text-hint hover:text-red-400 disabled:opacity-30 disabled:hover:text-dao-text-hint transition-colors text-sm px-1.5"
                  aria-label={`Remove option ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button
              type="button"
              onClick={addOption}
              disabled={busy}
              className="mt-2 text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50 transition-colors"
            >
              + Add option
            </button>
          )}
        </div>

        <div>
          <label htmlFor="signal-duration" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Duration (days)
          </label>
          <input
            id="signal-duration"
            type="text"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="input w-full sm:w-48"
            disabled={busy}
          />
          <p className="text-xs text-dao-text-hint mt-1">
            {formatDuration(config.minDuration)} – {formatDuration(config.maxDuration)}
          </p>
        </div>

        {/* Optional context — carried in the same labels post. */}
        <div>
          <label htmlFor="signal-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Description <span className="text-dao-text-hint font-normal">(optional)</span>
          </label>
          <textarea
            id="signal-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short context for voters."
            className="input w-full min-h-[60px] resize-y"
            maxLength={1000}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor="signal-discussion" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Discussion link <span className="text-dao-text-hint font-normal">(optional)</span>
          </label>
          <input
            id="signal-discussion"
            type="text"
            value={discussionUrl}
            onChange={(e) => setDiscussionUrl(e.target.value)}
            placeholder="https://forum… or ipfs://…"
            className="input w-full"
            maxLength={2048}
            disabled={busy}
          />
        </div>

        {canSchedule && (
          <div className="space-y-2">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={!schedule} onChange={() => setSchedule(false)} disabled={busy}
                  className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0" />
                <span className="text-sm text-dao-text-secondary">Open immediately</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={schedule} onChange={() => setSchedule(true)} disabled={busy}
                  className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0" />
                <span className="text-sm text-dao-text-secondary">Schedule</span>
              </label>
            </div>
            {schedule && (
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="input w-full"
                disabled={busy}
              />
            )}
          </div>
        )}

        <p className="text-xs text-dao-text-hint">
          Creating a poll takes two wallet transactions: one to open the poll, then one to post the
          option labels.
        </p>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={reset} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate} loading={busy}>
            {phase === 'creating' ? 'Creating poll…' : phase === 'posting' ? 'Posting options…' : 'Create Poll'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PollRow - one poll with status, tally bars, vote/cancel actions
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  ended: 'bg-dao-surface/60 text-dao-text-hint',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

function PollRow({
  poll,
  daoId,
  navigatorAddress,
  userAddress,
  connected,
  onChanged,
}: {
  poll: SignalPollRow
  daoId: string
  navigatorAddress: string
  userAddress: string | null
  connected: boolean
  onChanged: () => void
}) {
  const status = computeSignalPollStatus(poll)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingMeta, setEditingMeta] = useState(false)

  // Has this wallet voted? (indexer-backed; on-chain re-checked at submit)
  const { data: voteState } = useQuery({
    queryKey: ['signalHasVoted', navigatorAddress.toLowerCase(), poll.poll_id, userAddress?.toLowerCase()],
    queryFn: () => navigatorIndexerService.hasVotedOnPoll(navigatorAddress, poll.poll_id, userAddress!),
    enabled: connected && !!userAddress && status !== 'pending',
    staleTime: 15_000,
  })

  const totals = poll.tally.map((t) => safeBigInt(t))
  const grand = totals.reduce((a, b) => a + b, 0n)
  const isCreator = userAddress ? addressesEqual(userAddress, poll.creator) : false

  const handleVote = useCallback(async (option: number) => {
    setError(null)
    setBusy(true)
    try {
      // On-chain preflight: status + already-voted (indexer can lag).
      const onChainStatus = await navigatorService.signalPollStatus(navigatorAddress, BigInt(poll.poll_id))
      if (onChainStatus !== 1) { setError('Voting is not currently open for this poll.'); return }
      if (userAddress && (await navigatorService.signalHasVoted(navigatorAddress, BigInt(poll.poll_id), userAddress))) {
        setError("You've already voted in this poll."); return
      }
      await navigatorService.signalVote(navigatorAddress, BigInt(poll.poll_id), option)
      onChanged()
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [navigatorAddress, poll.poll_id, userAddress, onChanged])

  const handleCancel = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      await navigatorService.signalCancelPoll(navigatorAddress, BigInt(poll.poll_id))
      onChanged()
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }, [navigatorAddress, poll.poll_id, onChanged])

  const canVote = connected && status === 'active' && !voteState?.voted
  // Creator may cancel only before voting opens (the avatar/DAO cancels via governance otherwise).
  const canCancel = connected && isCreator && status === 'pending'
  // The creator may set/correct option labels & context while the poll is still open. The indexer
  // discards labels posts once a poll is ended/cancelled, so hide the affordance then too.
  const canEditMeta = connected && isCreator && (status === 'pending' || status === 'active')

  return (
    <div className="rounded-lg border border-dao-border bg-dao-dark-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dao-text break-words">{poll.question || `Poll #${poll.poll_id}`}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-dao-text-hint">
            <span>by</span>
            <AddressDisplay address={poll.creator} />
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </div>

      <p className="text-xs text-dao-text-hint mb-2">
        {status === 'pending'
          ? `Opens ${new Date(poll.voting_starts * 1000).toLocaleString()}`
          : status === 'active'
            ? `Closes ${new Date(poll.voting_ends * 1000).toLocaleString()}`
            : status === 'ended'
              ? `Ended ${new Date(poll.voting_ends * 1000).toLocaleString()}`
              : 'Cancelled'}
      </p>

      {/* Optional creator-supplied context (daoships.signal.poll). Text auto-escaped by React;
          the discussion link is scheme-checked before rendering. */}
      {poll.description && (
        <p className="text-xs text-dao-text-secondary mb-2 whitespace-pre-line break-words">{poll.description}</p>
      )}
      {poll.discussion_url && isValidUrl(poll.discussion_url) && (
        <a
          href={resolveUrl(poll.discussion_url) ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-400 hover:text-primary-300 transition-colors inline-block mb-2"
        >
          View discussion ↗
        </a>
      )}

      {/* Results / options */}
      <div className="space-y-2">
        {Array.from({ length: poll.option_count }, (_, i) => i).map((opt) => {
          const weight = totals[opt] ?? 0n
          const pct = grand === 0n ? 0 : Number((weight * 10000n) / grand) / 100
          const youVoted = voteState?.voted && voteState.option === opt
          return (
            <div key={opt}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-dao-text-secondary break-words">
                  {signalOptionLabel(poll, opt)}{youVoted && <span className="text-emerald-500 ml-1.5">· your vote</span>}
                </span>
                <span className="text-dao-text-hint font-mono">{pct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-dao-dark-3 overflow-hidden">
                  <div className="h-full bg-accent-500/60" style={{ width: `${pct}%` }} />
                </div>
                {canVote && (
                  <Button variant="secondary" size="sm" onClick={() => handleVote(opt)} loading={busy} disabled={busy}>
                    Vote
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {voteState?.voted && status === 'active' && (
        <p className="text-xs text-emerald-500 mt-2">You've voted in this poll.</p>
      )}

      {(canCancel || canEditMeta) && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          {canEditMeta && !editingMeta && (
            <button
              type="button"
              onClick={() => setEditingMeta(true)}
              className="text-xs text-dao-text-hint hover:text-dao-text transition-colors"
            >
              {poll.options ? 'Edit options & details' : 'Add options & details'}
            </button>
          )}
          {canCancel && (
            <Button variant="secondary" size="sm" onClick={handleCancel} loading={busy} disabled={busy}>
              Cancel Poll
            </Button>
          )}
        </div>
      )}

      {editingMeta && (
        <div className="mt-3 pt-3 border-t border-dao-border">
          <PollMetaForm
            daoId={daoId}
            navigatorAddress={navigatorAddress}
            pollId={poll.poll_id}
            optionCount={poll.option_count}
            initialOptions={poll.options ?? null}
            initialDescription={poll.description ?? ''}
            initialDiscussionUrl={poll.discussion_url ?? ''}
            onCancel={() => setEditingMeta(false)}
            onDone={() => { setEditingMeta(false); onChanged() }}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2" role="alert">{error}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PollMetaForm - creator sets/corrects option labels + context for an existing poll
// ───────────────────────────────────────────────────────────────────────────
// Single transaction (the daoships.signal.poll Poster post). optionCount is LOCKED to the
// on-chain count so options.length always matches — a mismatch would be discarded by the
// indexer. Only mounted for the creator while the poll is Pending/Active (see PollRow).
// ═══════════════════════════════════════════════════════════════════════════

function PollMetaForm({
  daoId,
  navigatorAddress,
  pollId,
  optionCount,
  initialOptions,
  initialDescription,
  initialDiscussionUrl,
  onCancel,
  onDone,
}: {
  daoId: string
  navigatorAddress: string
  pollId: string
  optionCount: number
  initialOptions: string[] | null
  initialDescription: string
  initialDiscussionUrl: string
  onCancel: () => void
  onDone: () => void
}) {
  const [options, setOptions] = useState<string[]>(() =>
    Array.from({ length: optionCount }, (_, i) => initialOptions?.[i] ?? ''),
  )
  const [description, setDescription] = useState(initialDescription)
  const [discussionUrl, setDiscussionUrl] = useState(initialDiscussionUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setOptionAt = (i: number, val: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)))

  const handleSave = async () => {
    setError(null)
    setBusy(true)
    try {
      await submitPollLabels(daoId, navigatorAddress, Number(pollId), { options, description, discussionUrl })
      onDone()
    } catch (e) {
      setError(mapError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-dao-text-hint">
        Posts a single transaction labelling this poll’s {optionCount} options (last-write-wins).
        The option count is fixed by the poll.
      </p>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-dao-text-hint w-5 flex-shrink-0">{i + 1}.</span>
            <input
              type="text"
              value={opt}
              onChange={(e) => setOptionAt(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="input flex-1"
              maxLength={200}
              disabled={busy}
            />
          </div>
        ))}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="input w-full min-h-[50px] resize-y text-sm"
        maxLength={1000}
        disabled={busy}
      />
      <input
        type="text"
        value={discussionUrl}
        onChange={(e) => setDiscussionUrl(e.target.value)}
        placeholder="Discussion link (optional) — https://… or ipfs://…"
        className="input w-full text-sm"
        maxLength={2048}
        disabled={busy}
      />
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} loading={busy}>
          Save options
        </Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function formatDuration(seconds: bigint): string {
  return formatDurationInput(Number(seconds))
}

function secondsToDaysString(seconds: bigint): string {
  const days = Number(seconds) / DAY
  return String(days)
}

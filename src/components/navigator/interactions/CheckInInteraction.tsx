/**
 * @deprecated This interaction component is maintained for backward compatibility
 * but the Check-In Navigator pattern is being phased out. Use other navigator
 * interaction patterns for new features.
 */

import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { formatDuration, formatCountdown } from '@/utils/time'
import { formatTokenAmount } from '@/utils/format'

// ═══════════════════════════════════════════════════════════════════════════
// CheckInInteraction - Check-In Navigator UI: shows next claim time and rewards
// (Deprecated - maintained for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

interface CheckInConfig {
  /** Interval between check-ins in seconds */
  checkInInterval: number
  /** Shares rewarded per check-in */
  sharesPerCheckIn: string
  /** Loot rewarded per check-in */
  lootPerCheckIn: string
  /** Maximum allowed missed check-ins before penalty */
  maxMissed: number
}

interface CheckInInteractionProps {
  navigatorAddress: string
  config: CheckInConfig
  userAddress: string
  /** Timestamp (epoch ms) of the user's last check-in, null if never checked in */
  lastCheckIn?: number | null
  /** Number of consecutive missed check-ins */
  missedCount?: number
  onCheckIn?: () => Promise<void>
}

export function CheckInInteraction({
  navigatorAddress,
  config,
  userAddress: _userAddress,
  lastCheckIn,
  missedCount = 0,
  onCheckIn,
}: CheckInInteractionProps) {
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate next eligible check-in time
  const nextCheckInMs = lastCheckIn
    ? lastCheckIn + config.checkInInterval * 1000
    : 0
  const now = Date.now()
  const canCheckIn = now >= nextCheckInMs
  const hasCheckedInBefore = lastCheckIn !== null && lastCheckIn !== undefined

  const handleCheckIn = async () => {
    if (!onCheckIn) return
    setError(null)
    setIsChecking(true)

    try {
      await onCheckIn()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Check-in failed')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-dao-border">
        <h3 className="text-lg font-semibold text-dao-text">Check-In</h3>
        <p className="text-xs text-dao-text-hint font-mono mt-0.5" title={navigatorAddress}>
          Navigator: {navigatorAddress.slice(0, 6)}...{navigatorAddress.slice(-4)}
        </p>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Config info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-dao-text-hint">Interval</p>
            <p className="text-dao-text-secondary">{formatDuration(config.checkInInterval)}</p>
          </div>
          <div>
            <p className="text-dao-text-hint">Reward per Check-In</p>
            <div className="space-y-0.5">
              {BigInt(config.sharesPerCheckIn || '0') > 0n && (
                <p className="font-mono text-primary-400 text-xs">
                  {formatTokenAmount(BigInt(config.sharesPerCheckIn))} shares
                </p>
              )}
              {BigInt(config.lootPerCheckIn || '0') > 0n && (
                <p className="font-mono text-dao-text-muted text-xs">
                  {formatTokenAmount(BigInt(config.lootPerCheckIn))} loot
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="text-dao-text-hint">Max Missed</p>
            <p className="text-dao-text-secondary">{config.maxMissed}</p>
          </div>
          <div>
            <p className="text-dao-text-hint">Your Missed</p>
            <p className={`font-medium ${missedCount >= config.maxMissed ? 'text-red-400' : missedCount > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {missedCount} / {config.maxMissed}
            </p>
          </div>
        </div>

        {/* Next check-in status */}
        <div className="bg-dao-dark-3 rounded-lg px-4 py-3 text-center">
          {!hasCheckedInBefore ? (
            <div>
              <p className="text-sm text-dao-text-muted">First Check-In Available</p>
              <p className="text-xs text-dao-text-hint mt-0.5">You have not checked in yet</p>
            </div>
          ) : canCheckIn ? (
            <div>
              <p className="text-sm text-green-400 font-medium">Check-In Available</p>
              <p className="text-xs text-dao-text-hint mt-0.5">
                Last check-in: {new Date(lastCheckIn!).toLocaleString()}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-dao-text-muted">Next Check-In</p>
              <p className="text-lg font-mono text-accent-400 mt-1">
                {formatCountdown(nextCheckInMs)}
              </p>
            </div>
          )}
        </div>

        {/* Missed check-in warning */}
        {missedCount > 0 && missedCount < config.maxMissed && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-yellow-400">
              You have missed {missedCount} check-in{missedCount > 1 ? 's' : ''}. Missing {config.maxMissed} will result in a penalty.
            </p>
          </div>
        )}

        {missedCount >= config.maxMissed && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">
              Maximum missed check-ins reached. You may be subject to penalties.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Action */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleCheckIn}
          loading={isChecking}
          disabled={!canCheckIn || !onCheckIn}
        >
          {canCheckIn ? 'Check In' : 'Not Yet Available'}
        </Button>
      </div>
    </div>
  )
}

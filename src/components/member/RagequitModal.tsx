import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useRagequit } from '@/hooks/useRagequit'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { sortAddressesNumerically } from '@/utils/address'
import { NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// RagequitModal - Two-step ragequit flow with token selection & payout preview
// ═══════════════════════════════════════════════════════════════════════════

export interface GuildTokenInfo {
  address: string
  symbol?: string
  name?: string
  balance: string
  decimals?: number
}

interface RagequitModalProps {
  isOpen: boolean
  onClose: () => void
  daoId: string
  daoShipAddress: string
  userAddress: string
  userShares: bigint
  userLoot: bigint
  guildTokens: GuildTokenInfo[]
  totalSupply: bigint
}

type Step = 'configure' | 'confirm' | 'success'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBurnPct(totalBurn: bigint, totalSupply: bigint): string {
  if (totalSupply === 0n) return '0'
  const bps = (totalBurn * 10000n) / totalSupply
  const whole = bps / 100n
  const frac = bps % 100n
  if (frac === 0n) return `${whole}`
  return `${whole}.${frac.toString().padStart(2, '0').replace(/0+$/, '')}`
}

function tokenLabel(token: GuildTokenInfo): string {
  return token.symbol || token.name || `${token.address.slice(0, 8)}...${token.address.slice(-4)}`
}

// ── Token Row ────────────────────────────────────────────────────────────

function TokenRow({
  token,
  returnAmount,
  selected,
  onToggle,
  disabled,
}: {
  token: GuildTokenInfo
  returnAmount: bigint
  selected: boolean
  onToggle: () => void
  disabled: boolean
}) {
  const isEmpty = BigInt(token.balance) === 0n
  const decimals = token.decimals ?? 18

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-label={`Include ${tokenLabel(token)} in withdrawal`}
      tabIndex={0}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onToggle()
        }
      }}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-opacity hover:bg-dao-bg-3 ${
        selected ? 'opacity-100' : 'opacity-50'
      } ${disabled ? 'pointer-events-none' : ''}`}
    >
      {/* Checkbox */}
      <div
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          selected
            ? 'bg-accent-500 border-accent-500'
            : 'border-dao-border bg-transparent'
        }`}
      >
        {selected && (
          <svg aria-hidden="true" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Token info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dao-text truncate">{tokenLabel(token)}</span>
          {isEmpty && <span className="text-2xs text-dao-text-hint">(empty)</span>}
        </div>
        <span className="text-2xs font-mono text-dao-text-hint">
          {token.address.slice(0, 8)}...{token.address.slice(-4)}
        </span>
      </div>

      {/* Return amount */}
      <span
        className={`text-sm font-mono flex-shrink-0 ${
          selected ? 'text-emerald-400' : 'text-dao-text-hint line-through'
        }`}
      >
        {formatTokenAmount(returnAmount, decimals)}
      </span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────

export function RagequitModal({
  isOpen,
  onClose,
  daoId,
  daoShipAddress,
  userAddress,
  userShares,
  userLoot,
  guildTokens,
  totalSupply,
}: RagequitModalProps) {
  const [step, setStep] = useState<Step>('configure')
  const [sharesToBurn, setSharesToBurn] = useState('')
  const [lootToBurn, setLootToBurn] = useState('')
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(() =>
    new Set(guildTokens.map((t) => t.address)),
  )
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const isSubmittingRef = useRef(false)
  const { ragequit, isRagequitting } = useRagequit(daoId)

  // Reset state only when modal opens (not on guild token changes, which happen after ragequit)
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      // Modal just opened — reset to initial state
      setStep('configure')
      setSharesToBurn('')
      setLootToBurn('')
      setSelectedTokens(new Set(guildTokens.map((t) => t.address)))
      setError(null)
      setTxHash(null)
      isSubmittingRef.current = false
    }
    prevOpenRef.current = isOpen
  }, [isOpen, guildTokens])

  // Move focus into the new step's content when the step changes (configure→confirm→success),
  // so keyboard/screen-reader users land on the fresh content instead of a removed node.
  // Skip the first render — Modal handles initial focus on open.
  const stepContainerRef = useRef<HTMLDivElement>(null)
  const firstStepRenderRef = useRef(true)
  useEffect(() => {
    if (firstStepRenderRef.current) {
      firstStepRenderRef.current = false
      return
    }
    stepContainerRef.current?.focus()
  }, [step])

  const sharesToBurnBigInt = sharesToBurn ? parseTokenAmount(sharesToBurn) : 0n
  const lootToBurnBigInt = lootToBurn ? parseTokenAmount(lootToBurn) : 0n
  const totalBurn = sharesToBurnBigInt + lootToBurnBigInt

  // Validation
  const sharesOverflow = sharesToBurnBigInt > userShares
  const lootOverflow = lootToBurnBigInt > userLoot

  // Calculate fair share returns for each guild token
  const tokenReturns = useMemo(() => {
    return guildTokens.map((token) => {
      const tokenBalance = BigInt(token.balance)
      const returnAmount =
        totalBurn > 0n && totalSupply > 0n
          ? (tokenBalance * totalBurn) / totalSupply
          : 0n
      return { ...token, returnAmount }
    })
  }, [guildTokens, totalBurn, totalSupply])

  // Dust warning: burning something but all returns are zero
  const isDustBurn =
    totalBurn > 0n &&
    tokenReturns.every((t) => !selectedTokens.has(t.address) || t.returnAmount === 0n) &&
    selectedTokens.size > 0

  const noTokensSelected = selectedTokens.size === 0

  // Can proceed to review?
  const canReview = totalBurn > 0n && !sharesOverflow && !lootOverflow

  // Token toggle helpers
  const toggleToken = useCallback((address: string) => {
    setSelectedTokens((prev) => {
      const next = new Set(prev)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedTokens(new Set(guildTokens.map((t) => t.address)))
  }, [guildTokens])

  const selectNone = useCallback(() => {
    setSelectedTokens(new Set())
  }, [])

  const burnAll = useCallback(() => {
    setSharesToBurn(formatTokenAmount(userShares))
    setLootToBurn(formatTokenAmount(userLoot))
  }, [userShares, userLoot])

  // Submit ragequit
  const handleRagequit = async () => {
    // Double-click guard (synchronous, before any async work)
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setError(null)

    try {
      const tokenAddresses = sortAddressesNumerically(
        guildTokens
          .filter((t) => selectedTokens.has(t.address))
          .map((t) => t.address),
      )

      await ragequit({
        daoShipAddress,
        to: userAddress,
        sharesToBurn: sharesToBurnBigInt,
        lootToBurn: lootToBurnBigInt,
        tokens: tokenAddresses,
      })
      setStep('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ragequit failed')
      isSubmittingRef.current = false
    }
  }

  // ── Step: Configure ──────────────────────────────────────────────────

  const renderConfigure = () => (
    <div className="space-y-5">
      {/* Warning */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-red-400">
          Ragequitting permanently burns your shares and/or loot in exchange
          for your proportional share of treasury tokens. This cannot be undone.
        </p>
      </div>

      {/* Current holdings + burn all shortcut */}
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-3 flex-1">
          <div className="card px-3 py-2 text-center">
            <p className="text-xs text-dao-text-hint">Your Shares</p>
            <p className="text-sm font-mono text-primary-400">{formatTokenAmount(userShares)}</p>
          </div>
          <div className="card px-3 py-2 text-center">
            <p className="text-xs text-dao-text-hint">Your Loot</p>
            <p className="text-sm font-mono text-dao-text-secondary">{formatTokenAmount(userLoot)}</p>
          </div>
        </div>
      </div>

      {(userShares > 0n || userLoot > 0n) && (
        <button
          type="button"
          className="text-sm text-accent-400 hover:text-accent-300 underline"
          onClick={burnAll}
        >
          Burn all shares and loot
        </button>
      )}

      {/* Shares to burn */}
      {userShares > 0n && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="rq-shares" className="text-sm font-medium text-dao-text-secondary">
              Shares to Burn
            </label>
            <button
              type="button"
              className="text-xs text-accent-400 hover:text-accent-300"
              onClick={() => setSharesToBurn(formatTokenAmount(userShares))}
            >
              Max
            </button>
          </div>
          <input
            id="rq-shares"
            type="text"
            inputMode="decimal"
            value={sharesToBurn}
            onChange={(e) => {
              if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                setSharesToBurn(e.target.value)
              }
            }}
            maxLength={30}
            placeholder="0"
            aria-invalid={sharesOverflow}
            aria-describedby={sharesToBurn ? 'rq-shares-hint' : undefined}
            className={`input w-full font-mono ${sharesOverflow ? 'border-red-500/50' : ''}`}
            disabled={isRagequitting}
          />
          {sharesToBurn && (
            <p id="rq-shares-hint" className={`text-xs mt-1 ${sharesOverflow ? 'text-red-400' : 'text-dao-text-hint'}`}>
              {sharesOverflow
                ? `Exceeds balance by ${formatTokenAmount(sharesToBurnBigInt - userShares)}`
                : `Remaining after burn: ${formatTokenAmount(userShares - sharesToBurnBigInt)}`}
            </p>
          )}
        </div>
      )}

      {/* Loot to burn */}
      {userLoot > 0n && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="rq-loot" className="text-sm font-medium text-dao-text-secondary">
              Loot to Burn
            </label>
            <button
              type="button"
              className="text-xs text-accent-400 hover:text-accent-300"
              onClick={() => setLootToBurn(formatTokenAmount(userLoot))}
            >
              Max
            </button>
          </div>
          <input
            id="rq-loot"
            type="text"
            inputMode="decimal"
            value={lootToBurn}
            onChange={(e) => {
              if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                setLootToBurn(e.target.value)
              }
            }}
            maxLength={30}
            placeholder="0"
            aria-invalid={lootOverflow}
            aria-describedby={lootToBurn ? 'rq-loot-hint' : undefined}
            className={`input w-full font-mono ${lootOverflow ? 'border-red-500/50' : ''}`}
            disabled={isRagequitting}
          />
          {lootToBurn && (
            <p id="rq-loot-hint" className={`text-xs mt-1 ${lootOverflow ? 'text-red-400' : 'text-dao-text-hint'}`}>
              {lootOverflow
                ? `Exceeds balance by ${formatTokenAmount(lootToBurnBigInt - userLoot)}`
                : `Remaining after burn: ${formatTokenAmount(userLoot - lootToBurnBigInt)}`}
            </p>
          )}
        </div>
      )}

      {/* Token selection */}
      {guildTokens.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-dao-text-secondary">
              Tokens to Withdraw
            </h4>
            <div className="flex items-center gap-3">
              <span className="text-xs text-dao-text-hint">
                {selectedTokens.size} of {guildTokens.length} selected
              </span>
              <button
                type="button"
                className="text-xs text-accent-400 hover:text-accent-300"
                onClick={selectAll}
              >
                All
              </button>
              <button
                type="button"
                className="text-xs text-accent-400 hover:text-accent-300"
                onClick={selectNone}
              >
                None
              </button>
            </div>
          </div>

          {/* Burn percentage */}
          {totalBurn > 0n && totalSupply > 0n && (
            <p className="text-xs text-dao-text-muted mb-2">
              Burning {formatBurnPct(totalBurn, totalSupply)}% of total supply
            </p>
          )}

          <div className="card divide-y divide-dao-border" role="group" aria-label="Select tokens to withdraw">
            {tokenReturns.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                returnAmount={token.returnAmount}
                selected={selectedTokens.has(token.address)}
                onToggle={() => toggleToken(token.address)}
                disabled={isRagequitting}
              />
            ))}
          </div>

          {/* Dust warning */}
          {isDustBurn && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mt-3">
              <p className="text-sm text-amber-400">
                Your burn amount is too small to receive any tokens. You will lose your
                shares/loot with no return.
              </p>
            </div>
          )}

          {/* No tokens selected warning */}
          {noTokensSelected && totalBurn > 0n && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mt-3">
              <p className="text-sm text-amber-400">
                No tokens selected. You will burn shares/loot without withdrawing any
                treasury tokens.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400">
            This DAO has no guild tokens configured. Ragequitting will burn your
            shares/loot but you will not receive any tokens.
          </p>
        </div>
      )}

      {/* Estimated returns label */}
      {guildTokens.length > 0 && totalBurn > 0n && (
        <p className="text-2xs text-dao-text-hint">
          Estimated returns may change before execution if treasury balances shift.
        </p>
      )}

      {/* Action */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => setStep('confirm')}
          disabled={!canReview}
        >
          Review Ragequit
        </Button>
      </div>
    </div>
  )

  // ── Step: Confirm ────────────────────────────────────────────────────

  const selectedReturns = tokenReturns.filter((t) => selectedTokens.has(t.address))

  const renderConfirm = () => (
    <div className="space-y-5">
      {/* Warning */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
        <p className="text-sm font-medium text-red-400">
          This action is irreversible. Your shares and loot will be permanently burned.
        </p>
      </div>

      {/* Summary card */}
      <div className="card divide-y divide-dao-border">
        {/* Burning */}
        <div className="px-4 py-3">
          <p className="text-xs text-dao-text-hint mb-2">Burning</p>
          {sharesToBurnBigInt > 0n && (
            <div className="flex justify-between">
              <span className="text-sm text-dao-text-secondary">Shares</span>
              <span className="text-sm font-mono text-red-400">
                -{formatTokenAmount(sharesToBurnBigInt)}
              </span>
            </div>
          )}
          {lootToBurnBigInt > 0n && (
            <div className="flex justify-between">
              <span className="text-sm text-dao-text-secondary">Loot</span>
              <span className="text-sm font-mono text-red-400">
                -{formatTokenAmount(lootToBurnBigInt)}
              </span>
            </div>
          )}
        </div>

        {/* Receiving */}
        <div className="px-4 py-3">
          <p className="text-xs text-dao-text-hint mb-2">
            Receiving (estimated)
          </p>
          {selectedReturns.length > 0 ? (
            selectedReturns.map((token) => (
              <div key={token.address} className="flex justify-between">
                <span className="text-sm text-dao-text-secondary">{tokenLabel(token)}</span>
                <span className="text-sm font-mono text-emerald-400">
                  +{formatTokenAmount(token.returnAmount, token.decimals ?? 18)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-amber-400">No tokens selected</p>
          )}
        </div>

        {/* Remaining */}
        <div className="px-4 py-3">
          <p className="text-xs text-dao-text-hint mb-2">Remaining After</p>
          <div className="flex justify-between">
            <span className="text-sm text-dao-text-secondary">Shares</span>
            <span className="text-sm font-mono text-dao-text-secondary">
              {formatTokenAmount(userShares - sharesToBurnBigInt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-dao-text-secondary">Loot</span>
            <span className="text-sm font-mono text-dao-text-secondary">
              {formatTokenAmount(userLoot - lootToBurnBigInt)}
            </span>
          </div>
        </div>
      </div>

      {/* Forfeit warning for deselected tokens */}
      {guildTokens.length > selectedReturns.length && guildTokens.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-400">
            You are opting out of{' '}
            {guildTokens.length - selectedReturns.length} token{guildTokens.length - selectedReturns.length > 1 ? 's' : ''}.
            The proportional value of your shares in{' '}
            {tokenReturns
              .filter((t) => !selectedTokens.has(t.address))
              .map((t) => tokenLabel(t))
              .join(', ')}{' '}
            will be forfeited permanently.
          </p>
        </div>
      )}

      {/* Receiving address */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-dao-text-hint">Tokens sent to</span>
        <AddressDisplay address={userAddress} />
      </div>

      {/* Tx hash (shown once submitted) */}
      {txHash && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-dao-text-hint">Transaction</span>
          <a
            href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-mono text-primary-400 hover:text-primary-300"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </a>
        </div>
      )}

      {/* Pending status */}
      {isRagequitting && (
        <p className="text-sm text-dao-text-muted text-center animate-pulse">
          Waiting for transaction confirmation...
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={() => {
            setError(null)
            setStep('configure')
          }}
          disabled={isRagequitting}
        >
          Back
        </Button>
        <Button
          variant="danger"
          onClick={handleRagequit}
          loading={isRagequitting}
          disabled={isRagequitting}
        >
          Confirm Ragequit
        </Button>
      </div>
    </div>
  )

  // ── Step: Success ────────────────────────────────────────────────────

  const renderSuccess = () => (
    <div className="space-y-5 text-center">
      {/* Checkmark */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg aria-hidden="true" className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold font-display text-dao-text">Ragequit Complete</h3>
        <p className="text-sm text-dao-text-muted mt-1">
          You burned {sharesToBurnBigInt > 0n ? `${formatTokenAmount(sharesToBurnBigInt)} shares` : ''}
          {sharesToBurnBigInt > 0n && lootToBurnBigInt > 0n ? ' and ' : ''}
          {lootToBurnBigInt > 0n ? `${formatTokenAmount(lootToBurnBigInt)} loot` : ''}
        </p>
      </div>

      {/* Received tokens */}
      {selectedReturns.length > 0 && (
        <div className="card divide-y divide-dao-border text-left">
          <div className="px-4 py-2">
            <p className="text-xs text-dao-text-hint">Estimated tokens received</p>
          </div>
          {selectedReturns.map((token) => (
            <div key={token.address} className="px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-dao-text-muted">{tokenLabel(token)}</span>
              <span className="text-sm font-mono text-emerald-400">
                +{formatTokenAmount(token.returnAmount, token.decimals ?? 18)}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-2xs text-dao-text-hint">
        Estimated amounts shown. Actual amounts depend on block confirmation.
      </p>

      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    </div>
  )

  // ── Modal Shell ────────────────────────────────────────────────────────

  const titles: Record<Step, string> = {
    configure: 'Ragequit',
    confirm: 'Confirm Ragequit',
    success: 'Ragequit Complete',
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titles[step]}
      size="lg"
      preventClose={isRagequitting}
    >
      <div ref={stepContainerRef} tabIndex={-1} className="outline-none">
        {step === 'configure' && renderConfigure()}
        {step === 'confirm' && renderConfirm()}
        {step === 'success' && renderSuccess()}
      </div>
    </Modal>
  )
}

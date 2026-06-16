import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quais } from 'quais'
import { useContractInteraction, type FunctionInfo } from '@/hooks/useContractInteraction'
import { useDebounce } from '@/hooks/useDebounce'
import { baseService } from '@/services/core/BaseService'
import { isAddress } from '@/services/utils/AddressUtils'
import { formatTokenAmount } from '@/utils/format'
import { decodeKnownCalldata } from '@/utils/knownCalldata'
import { decodeVestingAction } from '@/utils/vestingProposals'
import { VestingActionDetail } from '@/components/proposal/VestingActionDetail'

// ═══════════════════════════════════════════════════════════════════════════
// TransactionBuilder — Intent-based transaction row for custom action proposals
// ═══════════════════════════════════════════════════════════════════════════

export interface TransactionAction {
  to: string
  value: string
  data: string
  /** Human-readable summary for sidebar display */
  summary?: string
}

export interface KnownToken {
  address: string
  symbol: string
  name: string
}

type Intent = null | 'send' | 'token' | 'contract' | 'raw'

interface TransactionBuilderProps {
  index: number
  onChange: (index: number, action: TransactionAction) => void
  onRemove: (index: number) => void
  disabled?: boolean
  vaultAddress?: string
  vaultQuaiBalance?: bigint | null
  knownTokens?: KnownToken[]
  collapsed?: boolean
  onToggle?: () => void
  /** Prefilled action (e.g. a navigator deep-link) — seeds the row so the proposer can see/verify it. */
  initialAction?: TransactionAction
}

/** Pick the starting intent for a prefilled action. Deep-links always carry calldata → 'raw'. */
function deriveInitialIntent(a?: TransactionAction): Intent {
  if (a && isAddress(a.to) && a.data && a.data !== '0x') return 'raw'
  return null
}


const INTENT_LABELS: Record<string, string> = {
  send: 'Send QUAI',
  token: 'Transfer Token',
  contract: 'Call Contract',
  raw: 'Raw Transaction',
}

export function TransactionBuilder({
  index, onChange, onRemove, disabled = false,
  vaultAddress, vaultQuaiBalance, knownTokens = [],
  collapsed = false, onToggle, initialAction,
}: TransactionBuilderProps) {
  const [intent, setIntent] = useState<Intent>(() => deriveInitialIntent(initialAction))
  const [action, setAction] = useState<TransactionAction>(
    initialAction && isAddress(initialAction.to) ? { ...initialAction } : { ...EMPTY_ACTION },
  )

  // Wrap onChange to also track locally for summary display
  const handleChange = useCallback((i: number, a: TransactionAction) => {
    setAction(a)
    onChange(i, a)
  }, [onChange])

  const isConfigured = intent !== null && isAddress(action.to)

  // Build summary for collapsed view
  const summary = useMemo(() => {
    if (!intent) return 'Not configured'
    const label = INTENT_LABELS[intent]
    const addr = action.to ? `${action.to.slice(0, 8)}...${action.to.slice(-4)}` : '—'
    if (intent === 'send') {
      const amt = action.value !== '0' ? `${quais.formatQuai(BigInt(action.value))} QUAI` : '0 QUAI'
      return `${label} → ${addr} — ${amt}`
    }
    if (intent === 'token') {
      return `${label} → ${addr}`
    }
    // For contract/raw, prefer a decoded function name or the carried summary over the bare label.
    const decodedName = decodeKnownCalldata(action.data)?.name
    if (decodedName) return `${decodedName}() on ${addr}`
    if (action.summary) return `${action.summary} → ${addr}`
    if (intent === 'contract') {
      return `${label} on ${addr}`
    }
    return `${label} → ${addr}`
  }, [intent, action])

  const isCollapsed = collapsed && intent

  return (
    <div className={`card ${isCollapsed ? 'px-4 py-3 cursor-pointer hover:border-primary-500/30' : 'px-4 py-4 border-primary-500/20'} transition-colors`}
      onClick={isCollapsed ? onToggle : undefined}>

      {/* Collapsed header */}
      {isCollapsed && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <svg aria-hidden="true" className="w-3.5 h-3.5 text-dao-text-hint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-xs font-medium text-dao-text-muted">#{index + 1}</span>
            <span className="text-xs font-medium text-primary-400">{INTENT_LABELS[intent]}</span>
            <span className="text-xs text-dao-text-hint truncate">{summary}</span>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(index) }}
            disabled={disabled} className="text-dao-text-hint hover:text-red-400 transition-colors flex-shrink-0 ml-2" title="Remove action">
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded content — hidden when collapsed to preserve state */}
      <div className={isCollapsed ? 'hidden' : 'space-y-3'}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onToggle && isConfigured && (
              <button type="button" onClick={onToggle} aria-label="Collapse action" className="text-dao-text-hint hover:text-primary-400 transition-colors">
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <p className="text-sm font-semibold text-dao-text">Action #{index + 1}</p>
            {intent && (
              <span className="text-2xs px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">{INTENT_LABELS[intent]}</span>
            )}
            {intent && (
              <button type="button" onClick={() => setIntent(null)}
                className="text-2xs text-dao-text-hint hover:text-primary-400 transition-colors">
                Change
              </button>
            )}
          </div>
          <button type="button" onClick={() => onRemove(index)} disabled={disabled}
            className="text-dao-text-hint hover:text-red-400 transition-colors" title="Remove action">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Intent picker */}
        {!intent && (
          <IntentPicker onSelect={setIntent} knownTokens={knownTokens} disabled={disabled} />
        )}

        {/* Intent-specific fields — always mounted once intent is selected */}
        {intent === 'send' && (
          <SendQuaiFields index={index} onChange={handleChange} disabled={disabled} vaultQuaiBalance={vaultQuaiBalance} />
        )}
        {intent === 'token' && (
          <TransferTokenFields index={index} onChange={handleChange} disabled={disabled} vaultAddress={vaultAddress} knownTokens={knownTokens} />
        )}
        {intent === 'contract' && (
          <ContractCallFields index={index} onChange={handleChange} disabled={disabled} vaultAddress={vaultAddress} knownTokens={knownTokens} vaultQuaiBalance={vaultQuaiBalance} />
        )}
        {intent === 'raw' && (
          <RawTransactionFields index={index} onChange={handleChange} disabled={disabled} initial={initialAction} />
        )}
      </div>
    </div>
  )
}

const EMPTY_ACTION: TransactionAction = { to: '', value: '0', data: '0x' }

// ═══════════════════════════════════════════════════════════════════════════
// IntentPicker — "What do you want this action to do?"
// ═══════════════════════════════════════════════════════════════════════════

const INTENTS: { key: Intent & string; label: string; description: string; icon: string; advanced?: boolean }[] = [
  {
    key: 'send',
    label: 'Send QUAI',
    description: 'Send native QUAI to an address',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'token',
    label: 'Transfer Token',
    description: 'Send an ERC-20 token from the vault',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  {
    key: 'contract',
    label: 'Call Contract',
    description: 'Interact with a smart contract function',
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  },
  {
    key: 'raw',
    label: 'Raw Transaction',
    description: 'Set target, value, and calldata manually',
    icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    advanced: true,
  },
]

function IntentPicker({ onSelect, knownTokens, disabled }: {
  onSelect: (intent: Intent & string) => void
  knownTokens: KnownToken[]
  disabled: boolean
}) {
  return (
    <div className="space-y-1.5">
      {INTENTS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          disabled={disabled}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-dao-surface border border-transparent hover:border-dao-border"
        >
          <svg aria-hidden="true" className="w-5 h-5 text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-dao-text">
              {item.label}
              {item.advanced && <span className="text-2xs text-dao-text-hint ml-2">Advanced</span>}
            </p>
            <p className="text-xs text-dao-text-hint">{item.description}</p>
          </div>
          {item.key === 'token' && knownTokens.length > 0 && (
            <span className="text-2xs text-dao-text-hint flex-shrink-0">{knownTokens.length} tokens</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SendQuaiFields — Simple QUAI transfer
// ═══════════════════════════════════════════════════════════════════════════

function SendQuaiFields({ index, onChange, disabled, vaultQuaiBalance }: {
  index: number; onChange: TransactionBuilderProps['onChange']; disabled: boolean; vaultQuaiBalance?: bigint | null
}) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')

  const amountWei = useMemo(() => {
    if (!amount) return '0'
    try { return quais.parseQuai(amount).toString() } catch { return '0' }
  }, [amount])

  const lastEmitted = useRef('')
  useEffect(() => {
    if (!isAddress(recipient)) return
    const key = `${recipient}|${amountWei}`
    if (key === lastEmitted.current) return
    lastEmitted.current = key
    onChange(index, { to: recipient, value: amountWei, data: '0x', summary: `Send ${amount || '0'} QUAI` })
  }, [recipient, amountWei, amount, index, onChange])

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Recipient Address</label>
        <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x00..." className="input w-full font-mono text-sm" disabled={disabled} />
      </div>
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Amount (QUAI)</label>
        <input type="text" value={amount}
          onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setAmount(e.target.value) }}
          placeholder="0.0" className="input w-full font-mono text-sm" disabled={disabled} />
        {vaultQuaiBalance != null && (
          <p className="text-2xs text-dao-text-hint mt-1">
            Vault balance: <span className="font-mono text-primary-400">{formatTokenAmount(vaultQuaiBalance)} QUAI</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TransferTokenFields — ERC-20 token transfer with token picker
// ═══════════════════════════════════════════════════════════════════════════

function TransferTokenFields({ index, onChange, disabled, vaultAddress, knownTokens }: {
  index: number; onChange: TransactionBuilderProps['onChange']; disabled: boolean
  vaultAddress?: string; knownTokens: KnownToken[]
}) {
  const [tokenAddress, setTokenAddress] = useState(knownTokens[0]?.address ?? '')
  const [customToken, setCustomToken] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const isCustom = tokenAddress === '__custom__'
  const effectiveToken = isCustom ? customToken : tokenAddress

  const debouncedToken = useDebounce(effectiveToken, 500)
  const isValidToken = isAddress(debouncedToken)
  const hasProvider = baseService.hasProvider()

  // Fetch token metadata for decimals + symbol
  const { data: tokenMeta } = useQuery({
    queryKey: ['tokenMeta', debouncedToken],
    queryFn: async () => {
      const provider = baseService.getProvider()
      const c = new quais.Contract(quais.getAddress(debouncedToken), [
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
      ], provider)
      const [sym, dec] = await Promise.all([c.symbol() as Promise<string>, c.decimals().then((d: unknown) => Number(d))])
      return { symbol: sym, decimals: dec }
    },
    enabled: isValidToken && hasProvider,
    staleTime: Infinity,
  })

  // Fetch vault balance for the selected token
  const { data: vaultTokenBal } = useQuery({
    queryKey: ['vaultTokenBalance', vaultAddress, debouncedToken],
    queryFn: async () => {
      const provider = baseService.getProvider()
      const c = new quais.Contract(quais.getAddress(debouncedToken), [
        'function balanceOf(address) view returns (uint256)',
      ], provider)
      const bal = await c.balanceOf(vaultAddress!) as bigint
      return BigInt(bal)
    },
    enabled: isValidToken && !!vaultAddress && hasProvider,
    staleTime: 30_000,
  })

  const decimals = tokenMeta?.decimals ?? 18
  const symbol = tokenMeta?.symbol ?? knownTokens.find((t) => t.address.toLowerCase() === effectiveToken.toLowerCase())?.symbol ?? '???'

  // Encode the transfer(address, uint256) calldata
  const encodedData = useMemo(() => {
    if (!isAddress(recipient) || !amount || !isValidToken) return null
    try {
      const iface = new quais.Interface(['function transfer(address to, uint256 amount)'])
      const rawAmount = quais.parseUnits(amount, decimals).toString()
      return iface.encodeFunctionData('transfer', [recipient, rawAmount])
    } catch { return null }
  }, [recipient, amount, decimals, isValidToken])

  const lastEmitted = useRef('')
  useEffect(() => {
    if (!isValidToken || !encodedData) return
    const key = `${effectiveToken}|${encodedData}`
    if (key === lastEmitted.current) return
    lastEmitted.current = key
    onChange(index, { to: effectiveToken, value: '0', data: encodedData, summary: `Transfer ${amount || '0'} ${symbol}` })
  }, [effectiveToken, encodedData, amount, symbol, index, onChange, isValidToken])

  return (
    <div className="space-y-3">
      {/* Token selector */}
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Token</label>
        <select
          value={tokenAddress}
          onChange={(e) => { setTokenAddress(e.target.value); setAmount('') }}
          className="input w-full text-sm"
          disabled={disabled}
        >
          {knownTokens.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol || t.name} — {t.address.slice(0, 10)}...
            </option>
          ))}
          <option value="__custom__">Other token...</option>
        </select>
      </div>

      {/* Custom token address */}
      {isCustom && (
        <div>
          <label className="block text-xs font-medium text-dao-text-hint mb-1">Token Address</label>
          <input type="text" value={customToken} onChange={(e) => setCustomToken(e.target.value)}
            placeholder="0x00..." className="input w-full font-mono text-sm" disabled={disabled} />
        </div>
      )}

      {/* Vault token balance */}
      {vaultTokenBal != null && (
        <div className="flex items-center gap-2 bg-dao-dark-3/50 rounded px-3 py-1.5">
          <span className="text-2xs text-dao-text-hint">Vault balance:</span>
          <span className="text-xs font-mono text-primary-400">
            {formatTokenAmount(vaultTokenBal, decimals)} {symbol}
          </span>
        </div>
      )}

      {/* Recipient */}
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Recipient Address</label>
        <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x00..." className="input w-full font-mono text-sm" disabled={disabled} />
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Amount</label>
        <div className="relative">
          <input type="text" value={amount}
            onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setAmount(e.target.value) }}
            placeholder="0.0" className="input w-full font-mono text-sm pr-16" disabled={disabled} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dao-text-hint">{symbol}</span>
        </div>
        {amount && (
          <p className="text-2xs text-dao-text-hint mt-0.5 font-mono">
            {(() => { try { return quais.parseUnits(amount, decimals).toString() } catch { return '—' } })()} raw units
          </p>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ContractCallFields — ABI-driven contract interaction
// ═══════════════════════════════════════════════════════════════════════════

function ContractCallFields({ index, onChange, disabled, vaultAddress, knownTokens, vaultQuaiBalance }: {
  index: number; onChange: TransactionBuilderProps['onChange']; disabled: boolean
  vaultAddress?: string; knownTokens: KnownToken[]; vaultQuaiBalance?: bigint | null
}) {
  const [target, setTarget] = useState('')
  const [value, setValue] = useState('')
  const [selectedFnIndex, setSelectedFnIndex] = useState(-1)
  const [argValues, setArgValues] = useState<Record<number, string>>({})
  const [showRawData, setShowRawData] = useState(false)
  const [encodingError, setEncodingError] = useState<string | null>(null)
  const [pasteAbiMode, setPasteAbiMode] = useState(false)
  const [pasteAbiInput, setPasteAbiInput] = useState('')
  const [pasteAbiError, setPasteAbiError] = useState<string | null>(null)

  const debouncedTarget = useDebounce(target, 500)
  const isValidTarget = isAddress(debouncedTarget)
  const hasProvider = baseService.hasProvider()

  const {
    isContract, isDetecting, abi, abiSource, isFetchingAbi, abiFetchError,
    functions, setManualAbi, clearManualAbi, hasManualAbi, isErc20, tokenMetadata,
  } = useContractInteraction(isValidTarget ? debouncedTarget : undefined)

  // Vault balance for ERC-20 targets
  const { data: vaultBalance } = useQuery({
    queryKey: ['vaultTokenBalance', vaultAddress, debouncedTarget],
    queryFn: async (): Promise<{ balance: bigint; decimals: number; symbol: string } | null> => {
      try {
        const provider = baseService.getProvider()
        const contract = new quais.Contract(quais.getAddress(debouncedTarget), [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)',
        ], provider)
        const [bal, dec, sym] = await Promise.all([
          contract.balanceOf(vaultAddress!) as Promise<bigint>,
          contract.decimals().then((d: unknown) => Number(d)),
          contract.symbol() as Promise<string>,
        ])
        return { balance: BigInt(bal), decimals: dec, symbol: sym }
      } catch { return null }
    },
    enabled: !!vaultAddress && isErc20 && isValidTarget && hasProvider,
    staleTime: 30_000,
  })

  const selectedFn: FunctionInfo | null = selectedFnIndex >= 0 ? functions[selectedFnIndex] ?? null : null

  useEffect(() => { setSelectedFnIndex(-1); setArgValues({}); setEncodingError(null) }, [functions])

  const encodedData = useMemo(() => {
    if (!selectedFn || !abi) return null
    setEncodingError(null)
    try {
      const iface = new quais.Interface(abi)
      const values = selectedFn.inputs.map((inp, i) => {
        const raw = argValues[i] ?? ''
        if (isErc20 && tokenMetadata && isTokenAmountParam(inp.name, inp.type, selectedFn.name)) {
          try { return quais.parseUnits(raw || '0', tokenMetadata.decimals).toString() } catch { return raw }
        }
        return coerceValue(raw, inp.type)
      })
      const encoded = iface.encodeFunctionData(selectedFn.name, values)
      try { iface.decodeFunctionData(selectedFn.name, encoded) } catch {
        setEncodingError('Encoding verification failed'); return null
      }
      return encoded
    } catch (e) { setEncodingError(e instanceof Error ? e.message : 'Encoding failed'); return null }
  }, [selectedFn, argValues, abi, isErc20, tokenMetadata])

  const finalData = selectedFn ? (encodedData ?? '0x') : '0x'
  const valueWei = useMemo(() => {
    if (!value) return '0'
    try { return quais.parseQuai(value).toString() } catch { return '0' }
  }, [value])
  const showValue = !selectedFn || selectedFn.payable

  const lastEmitted = useRef('')
  useEffect(() => {
    if (!isValidTarget) return
    const key = `${target}|${valueWei}|${finalData}`
    if (key === lastEmitted.current) return
    lastEmitted.current = key
    const fnName = selectedFn?.name
    const summary = fnName ? `Call ${fnName}()` : 'Contract call'
    onChange(index, { to: target, value: valueWei, data: finalData, summary })
  }, [target, valueWei, finalData, selectedFn, index, onChange, isValidTarget])

  const handlePasteAbi = useCallback(() => {
    setPasteAbiError(null)
    try {
      const parsed = JSON.parse(pasteAbiInput)
      const result = setManualAbi(parsed)
      if (result.success) { setPasteAbiMode(false); setPasteAbiInput('') }
      else setPasteAbiError(result.error ?? 'Invalid ABI')
    } catch { setPasteAbiError('Invalid JSON') }
  }, [pasteAbiInput, setManualAbi])

  return (
    <div className="space-y-3">
      {/* Quick select guild tokens */}
      {knownTokens.length > 0 && !target && (
        <div>
          <p className="text-2xs font-medium text-dao-text-hint uppercase tracking-wider mb-1.5">Quick Select — Guild Tokens</p>
          <div className="flex flex-wrap gap-1.5">
            {knownTokens.map((t) => (
              <button key={t.address} type="button" onClick={() => setTarget(t.address)} disabled={disabled}
                className="text-xs px-2.5 py-1 rounded-full bg-dao-surface border border-dao-border text-dao-text-muted hover:border-primary-500/50 hover:text-primary-400 transition-colors">
                {t.symbol || t.name || `${t.address.slice(0, 8)}...`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Target address */}
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Contract Address</label>
        <input type="text" value={target} onChange={(e) => setTarget(e.target.value)}
          placeholder="0x00..." className="input w-full font-mono text-sm" disabled={disabled} />
        {isValidTarget && hasProvider && (
          <div className="flex items-center gap-2 mt-1">
            {isDetecting && <span className="text-xs text-dao-text-hint">Detecting...</span>}
            {isContract === true && !isFetchingAbi && <span className="text-xs text-emerald-400">Contract detected</span>}
            {isContract === true && isFetchingAbi && <span className="text-xs text-primary-400">Fetching ABI...</span>}
            {isContract === false && <span className="text-xs text-amber-400">Not a contract address</span>}
          </div>
        )}
      </div>

      {/* Vault ERC-20 balance */}
      {vaultBalance && (
        <div className="flex items-center gap-2 bg-dao-dark-3/50 rounded px-3 py-1.5">
          <span className="text-2xs text-dao-text-hint">Vault balance:</span>
          <span className="text-xs font-mono text-primary-400">
            {formatTokenAmount(BigInt(vaultBalance.balance), Number(vaultBalance.decimals))} {vaultBalance.symbol}
          </span>
        </div>
      )}

      {/* ABI source */}
      {isContract && abi && abiSource && (
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
            ABI from {abiSource === 'manual' ? 'manual paste' : abiSource.toUpperCase()}
          </span>
          {hasManualAbi && (
            <button type="button" onClick={clearManualAbi} className="text-2xs text-dao-text-hint hover:text-red-400">Clear</button>
          )}
        </div>
      )}

      {/* ABI not found */}
      {isContract && !abi && !isFetchingAbi && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-400">
            {abiFetchError ? 'Could not fetch ABI. ' : 'No ABI available. '}
            You can paste the ABI manually or use Raw Transaction mode.
          </p>
        </div>
      )}

      {/* Paste ABI */}
      {isContract && !abi && !isFetchingAbi && !pasteAbiMode && (
        <button type="button" onClick={() => setPasteAbiMode(true)}
          className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
          Paste ABI JSON
        </button>
      )}
      {pasteAbiMode && (
        <div className="space-y-2">
          <textarea value={pasteAbiInput} onChange={(e) => setPasteAbiInput(e.target.value)}
            placeholder='[{"type":"function","name":"...","inputs":[...],"stateMutability":"nonpayable"}]'
            rows={4} className="input w-full text-xs font-mono resize-y" />
          {pasteAbiError && <p className="text-xs text-red-400">{pasteAbiError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handlePasteAbi} className="text-xs text-primary-400 hover:text-primary-300">Load ABI</button>
            <button type="button" onClick={() => { setPasteAbiMode(false); setPasteAbiError(null) }} className="text-xs text-dao-text-hint">Cancel</button>
          </div>
        </div>
      )}

      {/* Function picker + params */}
      {abi && functions.length > 0 && (
        <>
          <div>
            <label className="block text-xs font-medium text-dao-text-hint mb-1">Function</label>
            <select value={selectedFnIndex} onChange={(e) => { setSelectedFnIndex(Number(e.target.value)); setArgValues({}); setEncodingError(null) }}
              className="input w-full text-sm" disabled={disabled}>
              <option value={-1}>Select a function...</option>
              {functions.map((fn, i) => (
                <option key={`${fn.selector}-${i}`} value={i}>
                  {fn.name}({fn.inputs.map((inp) => inp.type).join(', ')}){fn.payable ? ' [payable]' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedFn && selectedFn.inputs.length > 0 && (
            <div className="space-y-2">
              {selectedFn.inputs.map((inp, i) => (
                <div key={i}>
                  <label className="block text-xs text-dao-text-hint mb-0.5">
                    <span className="font-medium">{inp.name || `arg${i}`}</span>
                    <span className="text-dao-text-hint/60 ml-1">({inp.type})</span>
                  </label>
                  {inp.type === 'bool' ? (
                    <select value={argValues[i] ?? 'false'} onChange={(e) => setArgValues((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="input w-full text-sm" disabled={disabled}>
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  ) : isErc20 && tokenMetadata && isTokenAmountParam(inp.name, inp.type, selectedFn.name) ? (
                    <div>
                      <div className="relative">
                        <input type="text" value={argValues[i] ?? ''}
                          onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setArgValues((prev) => ({ ...prev, [i]: e.target.value })) }}
                          placeholder={`0.0 ${tokenMetadata.symbol}`} className="input w-full font-mono text-sm pr-16" disabled={disabled} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dao-text-hint">{tokenMetadata.symbol}</span>
                      </div>
                      {argValues[i] && (
                        <p className="text-2xs text-dao-text-hint mt-0.5 font-mono">
                          {(() => { try { return quais.parseUnits(argValues[i], tokenMetadata.decimals).toString() } catch { return '—' } })()} raw units
                        </p>
                      )}
                    </div>
                  ) : (
                    <input type="text" value={argValues[i] ?? ''} onChange={(e) => setArgValues((prev) => ({ ...prev, [i]: e.target.value }))}
                      placeholder={getPlaceholder(inp.type)} className="input w-full font-mono text-sm" disabled={disabled} />
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedFn && <p className="text-2xs font-mono text-dao-text-hint">Selector: {selectedFn.selector}</p>}
          {encodingError && <p className="text-xs text-red-400">{encodingError}</p>}

          {encodedData && (
            <div>
              <button type="button" onClick={() => setShowRawData(!showRawData)}
                className="text-2xs text-dao-text-hint hover:text-primary-400 transition-colors">
                {showRawData ? 'Hide' : 'Show'} encoded calldata
              </button>
              {showRawData && (
                <pre className="mt-1 text-2xs font-mono text-dao-text-hint bg-dao-dark-3 rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {encodedData}
                </pre>
              )}
            </div>
          )}
        </>
      )}

      {/* Value field for payable functions */}
      {showValue && isValidTarget && (
        <div>
          <label className="block text-xs font-medium text-dao-text-hint mb-1">QUAI to send</label>
          <input type="text" value={value}
            onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setValue(e.target.value) }}
            placeholder="0" className="input w-full font-mono text-sm" disabled={disabled} />
          {vaultQuaiBalance != null && (
            <p className="text-2xs text-dao-text-hint mt-1">
              Vault balance: <span className="font-mono text-primary-400">{formatTokenAmount(vaultQuaiBalance)} QUAI</span>
            </p>
          )}
        </div>
      )}
      {selectedFn && !selectedFn.payable && (
        <p className="text-2xs text-dao-text-hint">This function is non-payable — no QUAI will be sent.</p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// RawTransactionFields — Manual target + value + calldata
// ═══════════════════════════════════════════════════════════════════════════

function RawTransactionFields({ index, onChange, disabled, initial }: {
  index: number; onChange: TransactionBuilderProps['onChange']; disabled: boolean
  initial?: TransactionAction
}) {
  const [target, setTarget] = useState(initial?.to ?? '')
  const [value, setValue] = useState(() => {
    try { return initial && initial.value && initial.value !== '0' ? quais.formatQuai(BigInt(initial.value)) : '' } catch { return '' }
  })
  const [calldata, setCalldata] = useState(initial?.data ?? '0x')

  const valueWei = useMemo(() => {
    if (!value) return '0'
    try { return quais.parseQuai(value).toString() } catch { return '0' }
  }, [value])

  // Decode the calldata against the app's known deep-link signatures, so a prefilled action shows
  // what it actually does (e.g. enableModule(0xNavigator…)) rather than just a hex blob.
  const decoded = useMemo(() => decodeKnownCalldata(calldata), [calldata])
  // Vesting schedules get a plain-language preview so the proposer can verify exactly
  // who vests how much, the cliff, and the duration before submitting.
  const vesting = useMemo(() => decodeVestingAction(calldata), [calldata])

  const lastEmitted = useRef('')
  useEffect(() => {
    if (!isAddress(target)) return
    const key = `${target}|${valueWei}|${calldata}`
    if (key === lastEmitted.current) return
    lastEmitted.current = key
    const summary = decoded ? `${decoded.name}()` : (initial?.summary ?? 'Raw transaction')
    onChange(index, { to: target, value: valueWei, data: calldata, summary })
  }, [target, valueWei, calldata, decoded, initial, index, onChange])

  return (
    <div className="space-y-3">
      {/* Vesting schedule — plain-language preview */}
      {vesting && (
        <div className="bg-dao-dark-3/50 rounded-lg px-3 py-2">
          <p className="text-2xs font-medium text-dao-text-hint uppercase tracking-wider">
            {vesting.kind === 'revoke' ? 'This transaction revokes' : 'This transaction creates'}
          </p>
          <VestingActionDetail action={vesting} />
        </div>
      )}

      {/* Decoded preview — what this transaction actually calls */}
      {!vesting && decoded && (
        <div className="bg-dao-dark-3/50 rounded-lg px-3 py-2 space-y-1">
          <p className="text-2xs font-medium text-dao-text-hint uppercase tracking-wider">This transaction calls</p>
          <p className="text-sm font-medium text-dao-text-secondary font-mono break-all">{decoded.name}()</p>
          {initial?.summary && <p className="text-xs text-dao-text-muted">{initial.summary}</p>}
          {decoded.args.length > 0 && (
            <div className="space-y-0.5 pl-2 border-l-2 border-dao-border/50">
              {decoded.args.map((arg, i) => (
                <div key={i} className="flex items-baseline gap-1.5 text-xs">
                  <span className="text-dao-text-hint">{arg.name}</span>
                  <span className="text-2xs text-dao-text-hint/60">({arg.type})</span>
                  <span className="font-mono text-dao-text-secondary break-all">{arg.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Target Address</label>
        <input type="text" value={target} onChange={(e) => setTarget(e.target.value)}
          placeholder="0x00..." className="input w-full font-mono text-sm" disabled={disabled} />
      </div>
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Value (QUAI)</label>
        <input type="text" value={value}
          onChange={(e) => { if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) setValue(e.target.value) }}
          placeholder="0" className="input w-full font-mono text-sm" disabled={disabled} />
      </div>
      <div>
        <label className="block text-xs font-medium text-dao-text-hint mb-1">Calldata (hex)</label>
        <textarea value={calldata} onChange={(e) => setCalldata(e.target.value)}
          placeholder="0x..." rows={3} className="input w-full font-mono text-xs resize-y" disabled={disabled} />
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isTokenAmountParam(name: string, type: string, fnName: string): boolean {
  if (!type.startsWith('uint')) return false
  const lower = name.toLowerCase()
  if (['amount', 'value', '_amount', '_value', 'wad', 'rawamount', 'tokenamount'].includes(lower)) return true
  if ((fnName === 'transfer' || fnName === 'approve') && type === 'uint256') return lower !== 'deadline' && !lower.includes('address')
  if (fnName === 'transferFrom' && type === 'uint256') return true
  return false
}

function coerceValue(raw: string, type: string): unknown {
  if (type === 'bool') return raw === 'true'
  if (type.startsWith('tuple') || type.endsWith('[]')) {
    try { return JSON.parse(raw) } catch { return raw }
  }
  return raw
}

function getPlaceholder(type: string): string {
  if (type.startsWith('address')) return '0x00...'
  if (type.startsWith('uint') || type.startsWith('int')) return '0'
  if (type.startsWith('bytes')) return '0x...'
  if (type === 'string') return 'text'
  if (type === 'bool') return 'true/false'
  if (type.endsWith('[]')) return '[value1, value2, ...]'
  return ''
}

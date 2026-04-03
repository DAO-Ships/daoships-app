import { useState, useMemo } from 'react'
import { quais } from 'quais'
import { useContractInteraction } from '@/hooks/useContractInteraction'
import { AddressDisplay } from '@/components/common/AddressDisplay'

// ═══════════════════════════════════════════════════════════════════════════
// CustomActionDetail — ABI-decoded display for custom contract calls
// ═══════════════════════════════════════════════════════════════════════════

interface CustomActionDetailProps {
  target: string
  value: string
  calldata: string
}

interface DecodedCall {
  name: string
  selector: string
  args: Array<{ name: string; type: string; value: string }>
}

function tryDecode(abi: any[], calldata: string): DecodedCall | null {
  try {
    const iface = new quais.Interface(abi)
    const parsed = iface.parseTransaction({ data: calldata })
    if (!parsed) return null

    return {
      name: parsed.name,
      selector: parsed.selector,
      args: parsed.fragment.inputs.map((inp, i) => ({
        name: inp.name || `arg${i}`,
        type: inp.type,
        value: formatArgValue(parsed.args[i], inp.type),
      })),
    }
  } catch {
    return null
  }
}

function formatArgValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => typeof v === 'bigint' ? v.toString() : v))
  return String(value)
}

export function CustomActionDetail({ target, value, calldata }: CustomActionDetailProps) {
  const [showRaw, setShowRaw] = useState(false)
  const { abi, abiSource, isFetchingAbi } = useContractInteraction(target)

  const decoded = useMemo(() => {
    if (!abi || !calldata || calldata === '0x') return null
    return tryDecode(abi, calldata)
  }, [abi, calldata])

  const selector = calldata.length >= 10 ? calldata.slice(0, 10) : null
  const valueWei = BigInt(value || '0')
  const hasValue = valueWei > 0n

  return (
    <div className="mt-2 text-xs space-y-1.5">
      <div>
        <span className="text-dao-text-muted">Target:</span>{' '}
        <AddressDisplay address={target} />
      </div>

      {hasValue && (
        <div>
          <span className="text-dao-text-muted">Value:</span>{' '}
          <span className="text-dao-text-secondary font-mono">
            {quais.formatQuai(valueWei)} QUAI
          </span>
          <span className="text-dao-text-hint ml-1">({value} wei)</span>
        </div>
      )}

      {/* Decoded function call */}
      {decoded ? (
        <div className="bg-dao-dark-3/50 rounded-lg px-3 py-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-dao-text-secondary font-medium">{decoded.name}()</span>
            <span className="text-[10px] font-mono text-dao-text-hint">{decoded.selector}</span>
            {abiSource && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                {abiSource === 'manual' ? 'manual' : abiSource.toUpperCase()}
              </span>
            )}
          </div>
          {decoded.args.length > 0 && (
            <div className="space-y-0.5 pl-2 border-l-2 border-dao-border/50">
              {decoded.args.map((arg, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="text-dao-text-hint">{arg.name}</span>
                  <span className="text-[10px] text-dao-text-hint/60">({arg.type})</span>
                  <span className="font-mono text-dao-text-secondary break-all">{arg.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : isFetchingAbi ? (
        <p className="text-dao-text-hint">Resolving ABI...</p>
      ) : selector ? (
        <div>
          <span className="text-dao-text-muted">Selector:</span>{' '}
          <span className="font-mono text-dao-text-hint">{selector}</span>
        </div>
      ) : null}

      {/* Raw calldata toggle */}
      {calldata && calldata !== '0x' && (
        <div>
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] text-dao-text-hint hover:text-primary-400 transition-colors"
          >
            {showRaw ? 'Hide' : 'Show'} raw calldata
          </button>
          {showRaw && (
            <pre className="mt-1 text-[10px] font-mono text-dao-text-hint bg-dao-dark-3 rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
              {calldata}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

import { formatTokenAmount } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'

// ═══════════════════════════════════════════════════════════════════════════
// TokenAmount - Formatted BigInt token amount with optional symbol
// ═══════════════════════════════════════════════════════════════════════════

interface TokenAmountProps {
  amount: bigint | string
  symbol?: string
  decimals?: number
  className?: string
}

export function TokenAmount({
  amount,
  symbol,
  decimals = 18,
  className = '',
}: TokenAmountProps) {
  const value = typeof amount === 'bigint' ? amount : safeBigInt(amount)
  const formatted = formatTokenAmount(value, decimals)

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {formatted}
      {symbol && <span className="ml-1 text-dao-text-muted">{symbol}</span>}
    </span>
  )
}

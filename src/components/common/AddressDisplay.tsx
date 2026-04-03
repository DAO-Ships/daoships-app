import { CopyButton } from './CopyButton'
import { NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// AddressDisplay - Truncated address with copy + block explorer link
// ═══════════════════════════════════════════════════════════════════════════

interface AddressDisplayProps {
  address: string
  prefixLen?: number
  suffixLen?: number
  showCopy?: boolean
  showExplorer?: boolean
}

function truncateAddress(address: string, prefix: number, suffix: number): string {
  if (address.length <= prefix + suffix + 2) return address
  return `${address.slice(0, prefix)}...${address.slice(-suffix)}`
}

export function AddressDisplay({
  address,
  prefixLen = 6,
  suffixLen = 4,
  showCopy = true,
  showExplorer = true,
}: AddressDisplayProps) {
  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(address)
  const explorerUrl = isValidAddress ? `${NETWORK_CONFIG.blockExplorerUrl}/address/${address}` : '#'

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm">
      {showExplorer ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-400 hover:text-primary-300 transition-colors hover:underline"
          title="View on block explorer"
        >
          {truncateAddress(address, prefixLen, suffixLen)}
        </a>
      ) : (
        <span className="text-dao-text-secondary">
          {truncateAddress(address, prefixLen, suffixLen)}
        </span>
      )}
      {showCopy && <CopyButton text={address} size="sm" />}
    </span>
  )
}

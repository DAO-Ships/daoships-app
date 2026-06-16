import { quais } from 'quais'
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
  // Lenient on purpose: display should render a link for any well-formed address
  // (incl. foreign-shard or sentinel), not just strict Cyprus-1 user input.
  const isValidAddress = quais.isAddress(address)
  // Display and copy in EIP-55 checksum format so users can cross-reference
  // against their wallet (which uses mixed case) without seeing a mismatch.
  // Lower-case comparisons elsewhere in the codebase are unaffected.
  const checksummed = (() => {
    try {
      return quais.getAddress(address)
    } catch {
      return address
    }
  })()
  const explorerUrl = isValidAddress ? `${NETWORK_CONFIG.blockExplorerUrl}/address/${checksummed}` : '#'

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
          {truncateAddress(checksummed, prefixLen, suffixLen)}
        </a>
      ) : (
        <span className="text-dao-text-secondary">
          {truncateAddress(checksummed, prefixLen, suffixLen)}
        </span>
      )}
      {showCopy && <CopyButton text={checksummed} size="sm" />}
    </span>
  )
}

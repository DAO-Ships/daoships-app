import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/common/Button'
import { posterService } from '@/services/core/PosterService'
import {
  downloadAllowlistBackup,
  verifyAllowlistRoot,
  type AllowlistTreeDump,
} from '@/utils/allowlist'

// ═══════════════════════════════════════════════════════════════════════════
// AllowlistActions — Download backup + restore/re-post for navigator allowlists
// ═══════════════════════════════════════════════════════════════════════════

interface AllowlistDownloadProps {
  navigatorAddress: string
  root: string
  addresses: string[]
  treeDump: AllowlistTreeDump
}

/**
 * Download button for an existing allowlist (data available).
 */
export function AllowlistDownloadButton({ navigatorAddress, root, addresses, treeDump }: AllowlistDownloadProps) {
  return (
    <button
      type="button"
      onClick={() => downloadAllowlistBackup(navigatorAddress, root, addresses, treeDump)}
      className="inline-flex items-center gap-1.5 text-xs text-dao-text-hint hover:text-primary-400 transition-colors"
      title="Download allowlist backup JSON"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download Backup
    </button>
  )
}

interface AllowlistRestoreProps {
  daoId: string
  navigatorAddress: string
  allowlistRoot: string
}

/**
 * Restore panel shown when allowlist data is unavailable.
 * Lets the user upload a backup JSON and re-post it to the Poster contract.
 */
export function AllowlistRestore({ daoId, navigatorAddress, allowlistRoot }: AllowlistRestoreProps) {
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSuccess(false)

    try {
      const text = await file.text()
      const backup = JSON.parse(text)

      // Validate structure
      const treeDump = backup.treeDump as AllowlistTreeDump | undefined
      if (!treeDump) {
        setError('Invalid backup file: missing treeDump field.')
        return
      }

      const addresses = backup.addresses as string[] | undefined
      if (!Array.isArray(addresses) || addresses.length === 0) {
        setError('Invalid backup file: missing or empty addresses array.')
        return
      }

      // Verify root matches on-chain
      if (!verifyAllowlistRoot(treeDump, allowlistRoot)) {
        setError(`Root mismatch: backup root does not match on-chain allowlistRoot (${allowlistRoot.slice(0, 10)}...). Wrong file?`)
        return
      }

      // Re-post to Poster
      setIsPosting(true)
      await posterService.postNavigatorAllowlist({
        daoAddress: daoId.toLowerCase(),
        navigatorAddress: navigatorAddress.toLowerCase(),
        root: allowlistRoot,
        addresses,
        treeDump,
      })

      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['navigatorAllowlist', daoId, navigatorAddress] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore allowlist.')
    } finally {
      setIsPosting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [daoId, navigatorAddress, allowlistRoot, queryClient])

  if (success) {
    return (
      <p className="text-sm text-emerald-400">Allowlist data restored and posted on-chain.</p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-dao-text-muted">
        Upload a backup JSON file to re-post the allowlist data on-chain.
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFile}
          disabled={isPosting}
          className="hidden"
          id={`allowlist-restore-${navigatorAddress}`}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          loading={isPosting}
          disabled={isPosting}
        >
          {isPosting ? 'Posting...' : 'Restore from Backup'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

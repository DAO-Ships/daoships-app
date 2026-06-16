import type { useNavigatorAllowlist } from '@/hooks/useNavigatorAllowlist'
import { isOpenAllowlist } from '@/utils/allowlist'
import { AllowlistDownloadButton, AllowlistRestore } from '@/components/navigator/AllowlistActions'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorAllowlistStatus - Shared allowlist eligibility banner
// ═══════════════════════════════════════════════════════════════════════════

type AllowlistResult = ReturnType<typeof useNavigatorAllowlist>

/**
 * The "your address is / isn't on the allowlist" banner shared by every
 * membership navigator plugin. Renders nothing when the navigator is open
 * (no allowlist), so callers can drop it in unconditionally.
 *
 * Members (isMember) additionally get the backup-download / restore controls
 * so allowlist data can be recovered if the Poster record is ever lost.
 */
export function NavigatorAllowlistStatus({
  allowlist,
  allowlistRoot,
  userAddress,
  isMember,
  daoId,
  navigatorAddress,
}: {
  allowlist: AllowlistResult
  allowlistRoot: string
  userAddress: string | null
  isMember: boolean
  daoId: string
  navigatorAddress: string
}) {
  if (isOpenAllowlist(allowlistRoot)) return null

  const userAllowlisted = !userAddress ? false : allowlist.checkAddress(userAddress)

  return (
    <div
      className={`rounded-lg px-4 py-3 space-y-2 ${
        allowlist.dataUnavailable
          ? 'bg-amber-500/10 border border-amber-500/30'
          : userAddress && userAllowlisted
            ? 'bg-emerald-500/10 border border-emerald-500/30'
            : userAddress
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-primary-500/10 border border-primary-500/30'
      }`}
    >
      {allowlist.dataUnavailable ? (
        <>
          <p className="text-sm text-amber-400">Allowlist data unavailable. Proofs cannot be generated.</p>
          {isMember && (
            <AllowlistRestore daoId={daoId} navigatorAddress={navigatorAddress} allowlistRoot={allowlistRoot} />
          )}
        </>
      ) : (
        <>
          {userAddress && userAllowlisted ? (
            <p className="text-sm text-emerald-400">
              Your address is on the allowlist ({allowlist.addressCount} addresses).
            </p>
          ) : userAddress ? (
            <p className="text-sm text-red-400">Your address is not on the allowlist for this navigator.</p>
          ) : (
            <p className="text-sm text-primary-400">
              This navigator has an allowlist ({allowlist.addressCount} addresses). Connect your wallet to check eligibility.
            </p>
          )}
          {isMember && allowlist.treeDump && (
            <AllowlistDownloadButton
              navigatorAddress={navigatorAddress}
              root={allowlistRoot}
              addresses={allowlist.addresses}
              treeDump={allowlist.treeDump}
            />
          )}
        </>
      )}
    </div>
  )
}

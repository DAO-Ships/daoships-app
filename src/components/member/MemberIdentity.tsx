import type { MemberProfile } from '@/hooks/useMemberProfile'
import { MemberAvatar } from './MemberAvatar'
import { AddressDisplay } from '@/components/common/AddressDisplay'

// ═══════════════════════════════════════════════════════════════════════════
// MemberIdentity - Avatar + display name (falls back to truncated address)
// ═══════════════════════════════════════════════════════════════════════════

interface MemberIdentityProps {
  address: string
  profile?: MemberProfile | null
  /** Avatar size token (see MemberAvatar). */
  avatarSize?: 6 | 8 | 9 | 10 | 12 | 14
  /** Show the block-explorer link on the address (only used when there's no profile name). */
  showExplorer?: boolean
}

/**
 * Renders a member's identity: avatar plus their profile name when one exists,
 * otherwise the truncated address. When a name is shown, the address is shown
 * beneath it in small mono so the on-chain identity is still verifiable.
 */
export function MemberIdentity({
  address,
  profile,
  avatarSize = 8,
  showExplorer = true,
}: MemberIdentityProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <MemberAvatar avatar={profile?.avatar} size={avatarSize} />
      {profile?.name ? (
        <div className="min-w-0">
          <p className="text-sm font-medium text-dao-text truncate">{profile.name}</p>
          <AddressDisplay address={address} showExplorer={false} prefixLen={4} suffixLen={4} />
        </div>
      ) : (
        <AddressDisplay address={address} showExplorer={showExplorer} />
      )}
    </div>
  )
}

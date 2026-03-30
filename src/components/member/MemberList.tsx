import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Member } from '@/types'
import type { MemberProfile } from '@/hooks/useMemberProfile'
import { MemberCard } from './MemberCard'

// ═══════════════════════════════════════════════════════════════════════════
// MemberList - Paginated/virtualized member list
// ═══════════════════════════════════════════════════════════════════════════

interface MemberListProps {
  members: Member[]
  daoId: string
  profiles?: Map<string, MemberProfile>
}

const VIRTUALIZE_THRESHOLD = 10
const ESTIMATED_ROW_HEIGHT = 90

export function MemberList({ members, daoId, profiles }: MemberListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = members.length > VIRTUALIZE_THRESHOLD

  // Sort by shares descending
  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a, b) => Number(BigInt(b.shares || '0') - BigInt(a.shares || '0'))
      ),
    [members]
  )

  const virtualizer = useVirtualizer({
    count: sortedMembers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    enabled: shouldVirtualize,
  })

  if (members.length === 0) {
    return (
      <div className="card px-6 py-8 text-center">
        <p className="text-dao-text-hint">No members found</p>
      </div>
    )
  }

  // Non-virtualized rendering for small lists
  if (!shouldVirtualize) {
    return (
      <div className="space-y-2">
        {sortedMembers.map((member) => (
          <MemberCard key={member.id} member={member} daoId={daoId} profile={profiles?.get(member.member_address.toLowerCase())} />
        ))}
      </div>
    )
  }

  // Virtualized rendering for large lists
  return (
    <div
      ref={parentRef}
      className="max-h-[600px] overflow-auto scrollbar-thin scrollbar-thumb-dao-border scrollbar-track-transparent"
    >
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const member = sortedMembers[virtualRow.index]
          return (
            <div
              key={member.id}
              className="absolute left-0 right-0 px-0 pb-2"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MemberCard member={member} daoId={daoId} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

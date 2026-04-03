import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { posterService } from '@/services/core/PosterService'
import { Button } from '@/components/common/Button'
import { MemberAvatar } from '@/components/member/MemberAvatar'
import type { MemberProfile } from '@/hooks/useMemberProfile'

// ═══════════════════════════════════════════════════════════════════════════
// MemberProfileForm - Set or update the connected member's profile
// ═══════════════════════════════════════════════════════════════════════════

interface MemberProfileFormProps {
  daoId: string
  currentProfile: MemberProfile | null | undefined
  onClose: () => void
}

export function MemberProfileForm({ daoId, currentProfile, onClose }: MemberProfileFormProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(currentProfile?.name ?? '')
  const [bio, setBio] = useState(currentProfile?.bio ?? '')
  const [avatar, setAvatar] = useState(currentProfile?.avatar ?? '')
  const [error, setError] = useState<string | null>(null)

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Display name is required')
      await posterService.postMemberProfile({
        daoAddress: daoId.toLowerCase(),
        name: name.trim(),
        bio: bio.trim() || undefined,
        avatar: avatar.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberProfile', daoId] })
      queryClient.invalidateQueries({ queryKey: ['memberProfiles', daoId] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    postMutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="profile-name" className="block text-sm font-medium text-dao-text-secondary mb-1">
          Display Name *
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name or alias"
          className="input w-full"
          maxLength={32}
          required
          disabled={postMutation.isPending}
        />
      </div>

      {/* Bio */}
      <div>
        <label htmlFor="profile-bio" className="block text-sm font-medium text-dao-text-secondary mb-1">
          Bio
        </label>
        <textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell the DAO about yourself..."
          className="input w-full min-h-[80px] resize-y"
          maxLength={160}
          disabled={postMutation.isPending}
          rows={3}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{bio.length}/160</p>
      </div>

      {/* Avatar */}
      <div>
        <label htmlFor="profile-avatar" className="block text-sm font-medium text-dao-text-secondary mb-1">
          Avatar URL
        </label>
        <div className="flex items-center gap-3">
          <input
            id="profile-avatar"
            type="text"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://... or ipfs://..."
            className="input flex-1 font-mono text-sm"
            maxLength={200}
            disabled={postMutation.isPending}
          />
          <MemberAvatar avatar={avatar || undefined} size={10} />
        </div>
        <p className="text-xs text-dao-text-hint mt-1">Paste a URL to preview your avatar</p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Privacy warning */}
      <div className="bg-dao-dark-3 border border-dao-border rounded-lg px-4 py-3">
        <p className="text-xs text-dao-text-hint">
          Profile data is permanently stored on-chain and cannot be deleted. You can update
          your profile to overwrite displayed values, but the original data remains in the
          blockchain event logs.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          variant="primary"
          loading={postMutation.isPending}
          disabled={!name.trim()}
        >
          {currentProfile ? 'Update Profile' : 'Set Profile'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={postMutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

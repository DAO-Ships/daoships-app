import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'
import { DaoAvatar } from '@/components/dao/DaoAvatar'
import { DaoThemeEditor } from '@/components/dao/DaoThemeEditor'
import type { DaoTheme } from '@/utils/daoTheme'

// ═══════════════════════════════════════════════════════════════════════════
// ProfileForm - DAO profile update proposal form
// ═══════════════════════════════════════════════════════════════════════════

export interface ProfileFormData {
  title: string
  description: string
  offering: string
  expiration: string
  discussionUrl: string
  profile: {
    name: string
    description: string
    avatar: string
    banner: string
    theme?: DaoTheme
    links: Record<string, string>
    tags: string[]
  }
  currentProfile: {
    name?: string
    description?: string
    avatar?: string
    banner?: string
    theme?: DaoTheme
    links?: Record<string, string>
    tags?: string[]
  }
}

interface ProfileFormProps {
  currentProfile: {
    name?: string
    description?: string
    avatar?: string
    banner?: string
    theme?: DaoTheme
    links?: Record<string, string>
    tags?: string[]
  }
  minOfferingDisplay: string
  canSelfSponsor?: boolean
  onSubmit: (data: ProfileFormData) => void
  isSubmitting?: boolean
}

const STANDARD_LINKS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'website', label: 'Website', placeholder: 'https://your-dao.com' },
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
  { key: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/...' },
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/...' },
  { key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/...' },
  { key: 'docs', label: 'Documentation', placeholder: 'https://docs.your-dao.com' },
  { key: 'forum', label: 'Forum', placeholder: 'https://forum.your-dao.com' },
]

export function ProfileForm({
  currentProfile,
  minOfferingDisplay,
  canSelfSponsor = false,
  onSubmit,
  isSubmitting = false,
}: ProfileFormProps) {
  const [title, setTitle] = useState('')
  const [proposalDescription, setProposalDescription] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')

  // Profile fields — pre-filled from current values
  const [name, setName] = useState(currentProfile.name || '')
  const [description, setDescription] = useState(currentProfile.description || '')
  const [avatar, setAvatar] = useState(currentProfile.avatar || '')
  const [banner, setBanner] = useState(currentProfile.banner || '')
  const [theme, setTheme] = useState<DaoTheme>(currentProfile.theme || {})
  const [links, setLinks] = useState<Record<string, string>>(currentProfile.links || {})
  const [tagsInput, setTagsInput] = useState((currentProfile.tags || []).join(', '))

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Change detection helpers
  const isNameChanged = name.trim() !== (currentProfile.name || '')
  const isDescChanged = description.trim() !== (currentProfile.description || '')
  const isAvatarChanged = avatar.trim() !== (currentProfile.avatar || '')
  const isBannerChanged = banner.trim() !== (currentProfile.banner || '')
  const isThemeChanged = JSON.stringify(theme) !== JSON.stringify(currentProfile.theme || {})
  const isLinksChanged = JSON.stringify(links) !== JSON.stringify(currentProfile.links || {})
  const isTagsChanged = tagsInput.split(',').map((t) => t.trim()).filter(Boolean).join(',') !==
    (currentProfile.tags || []).join(',')
  const hasAnyChange = isNameChanged || isDescChanged || isAvatarChanged || isBannerChanged || isThemeChanged || isLinksChanged || isTagsChanged

  const updateLink = (key: string, value: string) => {
    setLinks((prev) => {
      const next = { ...prev }
      if (value.trim()) {
        next[key] = value.trim()
      } else {
        delete next[key]
      }
      return next
    })
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) {
      newErrors.title = 'Proposal title is required'
    } else if (title.length > 120) {
      newErrors.title = 'Title must be 120 characters or fewer'
    }
    if (!name.trim()) {
      newErrors.name = 'DAO name is required'
    } else if (name.length > 64) {
      newErrors.name = 'Name must be 64 characters or fewer'
    }
    if (description.length > 280) {
      newErrors.description = 'Description must be 280 characters or fewer'
    }
    if (avatar && avatar.length > 200) {
      newErrors.avatar = 'Avatar URL must be 200 characters or fewer'
    }
    if (banner && banner.length > 2048) {
      newErrors.banner = 'Banner URL must be 2048 characters or fewer'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    // Parse tags from comma-separated input
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 10)

    // Filter empty links
    const cleanLinks: Record<string, string> = {}
    for (const [key, value] of Object.entries(links)) {
      if (value.trim()) cleanLinks[key] = value.trim()
    }

    onSubmit({
      title: title.trim(),
      description: proposalDescription.trim(),
      offering,
      expiration,
      discussionUrl,
      profile: {
        name: name.trim(),
        description: description.trim(),
        avatar: avatar.trim(),
        banner: banner.trim(),
        theme: Object.keys(theme).length > 0 ? theme : undefined,
        links: cleanLinks,
        tags,
      },
      currentProfile,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Proposal metadata */}
      <div className="space-y-5">
        <div>
          <label htmlFor="profile-proposal-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Proposal Title <span className="text-red-400">*</span>
          </label>
          <input
            id="profile-proposal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Update DAO profile"
            className="input w-full"
            maxLength={120}
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
          {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label htmlFor="profile-proposal-desc" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Proposal Description
          </label>
          <textarea
            id="profile-proposal-desc"
            value={proposalDescription}
            onChange={(e) => setProposalDescription(e.target.value)}
            placeholder="Explain why the profile should be updated..."
            className="input w-full min-h-[60px] resize-y"
            maxLength={2000}
            disabled={isSubmitting}
            rows={2}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{proposalDescription.length}/2000</p>
        </div>

        {/* Discussion Link */}
        <div>
          <label htmlFor="profile-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Discussion Link
          </label>
          <input
            id="profile-discussion-url"
            type="url"
            value={discussionUrl}
            onChange={(e) => setDiscussionUrl(e.target.value)}
            placeholder="https://forum.mydao.xyz/t/..."
            className="input w-full font-mono text-sm"
            maxLength={200}
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{discussionUrl.length}/200</p>
        </div>
      </div>

      {/* Profile fields */}
      <ProposalActionSection title="Profile Details">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-dao-text-secondary">Profile Details</h3>
          {hasAnyChange ? (
            <span className="text-xs text-accent-500 font-medium">Changes detected</span>
          ) : (
            <span className="text-xs text-dao-text-hint">No changes yet</span>
          )}
        </div>

        {/* Name */}
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            DAO Name <span className="text-red-400">*</span>
            {isNameChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome DAO"
            className="input w-full"
            maxLength={64}
            disabled={isSubmitting}
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          <p className="text-xs text-dao-text-hint mt-1">{name.length}/64</p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="profile-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            DAO Description
            {isDescChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </label>
          <textarea
            id="profile-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is your DAO about?"
            className="input w-full min-h-[100px] resize-y"
            maxLength={280}
            disabled={isSubmitting}
            rows={4}
          />
          {errors.description && <p className="text-xs text-red-400 mt-1">{errors.description}</p>}
          <p className="text-xs text-dao-text-hint mt-1">{description.length}/280</p>
        </div>

        {/* Avatar URL with preview */}
        <div>
          <label htmlFor="profile-avatar" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Avatar URL
            {isAvatarChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </label>
          <div className="flex items-start gap-3">
            <DaoAvatar src={avatar} alt={name || 'DAO'} size="md" />
            <div className="flex-1">
              <input
                id="profile-avatar"
                type="url"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/logo.png or ipfs://..."
                className="input w-full"
                maxLength={200}
                disabled={isSubmitting}
              />
              <p className="text-xs text-dao-text-hint mt-1">
                PNG, JPG, SVG, or IPFS link for your DAO's logo
              </p>
              {errors.avatar && <p className="text-xs text-red-400 mt-1">{errors.avatar}</p>}
            </div>
          </div>
        </div>

        {/* Banner URL */}
        <div>
          <label htmlFor="profile-banner" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Banner URL
            {isBannerChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </label>
          <input
            id="profile-banner"
            type="url"
            value={banner}
            onChange={(e) => setBanner(e.target.value)}
            placeholder="https://example.com/banner.png or ipfs://..."
            className="input w-full"
            maxLength={2048}
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1">Wide image shown across the top of your DAO page</p>
          {errors.banner && <p className="text-xs text-red-400 mt-1">{errors.banner}</p>}
        </div>

        {/* Color scheme */}
        <div>
          <h4 className="text-sm font-medium text-dao-text-secondary mb-3">
            Color Scheme
            {isThemeChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </h4>
          <DaoThemeEditor value={theme} onChange={setTheme} disabled={isSubmitting} />
        </div>

        {/* Links */}
        <div>
          <h4 className="text-sm font-medium text-dao-text-secondary mb-3">
            Links
            {isLinksChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </h4>
          <div className="space-y-3">
            {STANDARD_LINKS.map(({ key, label, placeholder }) => (
              <div key={key} className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-3 sm:items-center">
                <label htmlFor={`profile-link-${key}`} className="text-xs text-dao-text-muted sm:text-right">
                  {label}
                </label>
                <input
                  id={`profile-link-${key}`}
                  type="url"
                  value={links[key] || ''}
                  onChange={(e) => updateLink(key, e.target.value)}
                  placeholder={placeholder}
                  className="input w-full text-sm"
                  maxLength={200}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="profile-tags" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Tags
            {isTagsChanged && <span className="ml-2 text-xs text-accent-500">modified</span>}
          </label>
          <input
            id="profile-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="defi, governance, community"
            className="input w-full"
            maxLength={500}
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1">
            Comma-separated, up to 10 tags
          </p>
        </div>
      </div>
      </ProposalActionSection>

      {/* Settings */}
      <ProposalSettingsFields
        expiration={expiration}
        onExpirationChange={setExpiration}
        disabled={isSubmitting}
      />

      {/* Offering */}
      <OfferingField
        value={offering}
        onChange={setOffering}
        minOfferingDisplay={minOfferingDisplay}
        canSelfSponsor={canSelfSponsor}
        disabled={isSubmitting}
      />

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!title.trim() || !name.trim() || !hasAnyChange}
        >
          Submit Profile Update Proposal
        </Button>
      </div>
    </form>
  )
}

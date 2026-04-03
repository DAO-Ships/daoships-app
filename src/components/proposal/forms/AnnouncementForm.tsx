import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { OfferingField } from './OfferingField'
import { ProposalSettingsFields } from './ProposalSettingsFields'
import { ProposalActionSection } from './ProposalActionSection'
import { DateTimePicker } from '@/components/common/DateTimePicker'

// ═══════════════════════════════════════════════════════════════════════════
// AnnouncementForm - Create a DAO announcement via governance proposal
// ═══════════════════════════════════════════════════════════════════════════

interface AnnouncementFormProps {
  minOfferingDisplay: string
  canSelfSponsor: boolean
  onSubmit: (data: {
    title: string
    description: string
    offering: string
    expiration: string
    discussionUrl: string
    announcementTitle: string
    announcementBody: string
    severity: 'info' | 'warning' | 'critical'
    announcementUrl: string
    announcementExpiresAt: string
  }) => void
  isSubmitting: boolean
}

export function AnnouncementForm({
  minOfferingDisplay,
  canSelfSponsor,
  onSubmit,
  isSubmitting,
}: AnnouncementFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offering, setOffering] = useState('')
  const [expiration, setExpiration] = useState('')
  const [discussionUrl, setDiscussionUrl] = useState('')
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementBody, setAnnouncementBody] = useState('')
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('info')
  const [announcementUrl, setAnnouncementUrl] = useState('')
  const [announcementExpiresAt, setAnnouncementExpiresAt] = useState('')

  const isValid = title.trim() && announcementTitle.trim()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    onSubmit({
      title: title.trim() || `Announcement: ${announcementTitle}`,
      description: description.trim(),
      offering,
      expiration,
      discussionUrl,
      announcementTitle,
      announcementBody,
      severity,
      announcementUrl,
      announcementExpiresAt,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Zone 1: Identity */}
      <div>
        <label htmlFor="ann-title" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Proposal Title *
        </label>
        <input
          id="ann-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Post community update announcement"
          maxLength={120}
          className="input w-full"
          disabled={isSubmitting}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{title.length}/120</p>
      </div>

      <div>
        <label htmlFor="ann-description" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Description
        </label>
        <textarea
          id="ann-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why should this announcement be posted?"
          maxLength={2000}
          rows={2}
          className="input w-full min-h-[60px] resize-y"
          disabled={isSubmitting}
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">{description.length}/2000</p>
      </div>

      {/* Discussion Link */}
      <div>
        <label htmlFor="announce-discussion-url" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Discussion Link
        </label>
        <input
          id="announce-discussion-url"
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

      {/* Zone 2: Action — Announcement Content */}
      <ProposalActionSection title="Announcement Content">
        <div>
          <label htmlFor="ann-headline" className="block text-xs font-medium text-dao-text-secondary mb-1">
            Headline *
          </label>
          <input
            id="ann-headline"
            type="text"
            value={announcementTitle}
            onChange={(e) => setAnnouncementTitle(e.target.value)}
            placeholder="Announcement headline"
            maxLength={100}
            className="input w-full"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="ann-body" className="block text-xs font-medium text-dao-text-secondary mb-1">
            Body
          </label>
          <textarea
            id="ann-body"
            value={announcementBody}
            onChange={(e) => setAnnouncementBody(e.target.value)}
            placeholder="Brief announcement details..."
            maxLength={500}
            rows={3}
            className="input w-full resize-y"
            disabled={isSubmitting}
          />
          <p className="text-xs text-dao-text-hint mt-1 text-right">{announcementBody.length}/500</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-dao-text-secondary mb-1">
            Severity
          </label>
          <div className="flex gap-2" role="radiogroup" aria-label="Announcement severity">
            {(['info', 'warning', 'critical'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={severity === s}
                onClick={() => setSeverity(s)}
                disabled={isSubmitting}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  severity === s
                    ? s === 'info'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : s === 'warning'
                        ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-red-500 text-white border-red-500'
                    : 'bg-dao-dark-3 text-dao-text-muted border-dao-border hover:border-dao-text-hint'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="ann-url" className="block text-xs font-medium text-dao-text-secondary mb-1">
            Link URL
          </label>
          <input
            id="ann-url"
            type="url"
            value={announcementUrl}
            onChange={(e) => setAnnouncementUrl(e.target.value)}
            placeholder="https://forum.mydao.xyz/t/..."
            className="input w-full font-mono text-sm"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-dao-text-secondary mb-1">
            Expires At
          </label>
          <DateTimePicker
            value={announcementExpiresAt}
            onChange={setAnnouncementExpiresAt}
            placeholder="No expiration"
            disabled={isSubmitting}
          />
        </div>
      </ProposalActionSection>

      {/* Zone 3: Settings */}
      <ProposalSettingsFields
        expiration={expiration}
        onExpirationChange={setExpiration}
        disabled={isSubmitting}
      />

      <OfferingField
        value={offering}
        onChange={setOffering}
        minOfferingDisplay={minOfferingDisplay}
        canSelfSponsor={canSelfSponsor}
        disabled={isSubmitting}
      />

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!isValid || isSubmitting}
        >
          Submit Announcement Proposal
        </Button>
      </div>
    </form>
  )
}

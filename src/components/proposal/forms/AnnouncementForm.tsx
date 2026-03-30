import { useState } from 'react'
import { Button } from '@/components/common/Button'

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
    expiration?: string
    announcementTitle: string
    announcementBody: string
    severity: 'info' | 'warning' | 'critical'
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
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementBody, setAnnouncementBody] = useState('')
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('info')

  const handleSubmit = () => {
    onSubmit({
      title: title || `Announcement: ${announcementTitle}`,
      description,
      offering,
      announcementTitle,
      announcementBody,
      severity,
    })
  }

  const isValid = title.trim() && announcementTitle.trim()

  return (
    <div className="space-y-6">
      {/* Proposal metadata */}
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Proposal Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Post community update announcement"
          maxLength={200}
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Proposal Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why should this announcement be posted?"
          maxLength={1000}
          rows={2}
          className="input w-full resize-none"
        />
      </div>

      <hr className="border-dao-border" />

      {/* Announcement content */}
      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Announcement Title *
        </label>
        <input
          type="text"
          value={announcementTitle}
          onChange={(e) => setAnnouncementTitle(e.target.value)}
          placeholder="Announcement headline"
          maxLength={200}
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Announcement Body
        </label>
        <textarea
          value={announcementBody}
          onChange={(e) => setAnnouncementBody(e.target.value)}
          placeholder="Announcement details..."
          maxLength={1000}
          rows={4}
          className="input w-full resize-none"
        />
        <p className="text-xs text-dao-text-hint mt-1 text-right">
          {announcementBody.length}/1000
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
          Severity
        </label>
        <div className="flex gap-3">
          {(['info', 'warning', 'critical'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
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

      {/* Offering */}
      {!canSelfSponsor && (
        <div>
          <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">
            Proposal Offering ({minOfferingDisplay} QUAI required)
          </label>
          <input
            type="text"
            value={offering}
            onChange={(e) => {
              if (e.target.value === '' || /^\d*\.?\d*$/.test(e.target.value)) {
                setOffering(e.target.value)
              }
            }}
            placeholder={minOfferingDisplay}
            className="input w-full font-mono"
          />
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handleSubmit}
        loading={isSubmitting}
        disabled={!isValid || isSubmitting}
      >
        Submit Announcement Proposal
      </Button>
    </div>
  )
}

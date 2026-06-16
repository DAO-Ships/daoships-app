import { useState, type ReactNode } from 'react'
import { Button } from '@/components/common/Button'

// ═══════════════════════════════════════════════════════════════════════════
// pluginShared — shared form components for navigator plugins
// (error-mapping helper lives in ./pluginErrors to keep this a components-only module)
// ═══════════════════════════════════════════════════════════════════════════

/** Labeled form field wrapper used by the navigator create-forms. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-dao-text-secondary mb-1">{label}</label>
      {children}
    </div>
  )
}

/**
 * Button that builds a proposal deep-link href on click and navigates if valid.
 * `build` returns the href, or null when the form is invalid (it surfaces its own errors).
 */
export function ContinueToProposal({ build }: { build: () => string | null }) {
  const [navigating, setNavigating] = useState(false)
  return (
    <Button
      variant="primary"
      size="sm"
      loading={navigating}
      onClick={() => {
        const href = build()
        if (href) {
          setNavigating(true)
          window.location.href = href
        }
      }}
    >
      Continue to Proposal →
    </Button>
  )
}

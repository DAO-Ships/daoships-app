import type { DaoAnnouncement } from '@/hooks/useDaoAnnouncements'
import { formatTimeAgo } from '@/utils/time'
import { safeHref } from '@/utils/url'
import { SafeMarkdown } from '@/components/common/SafeMarkdown'

// ═══════════════════════════════════════════════════════════════════════════
// AnnouncementBanner - Severity-styled DAO announcement display
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_STYLES = {
  info: {
    container: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700/30',
    icon: 'text-primary-400',
    title: 'text-primary-700 dark:text-primary-300',
    body: 'text-primary-600 dark:text-primary-400/80',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30',
    icon: 'text-amber-500',
    title: 'text-amber-700 dark:text-amber-300',
    body: 'text-amber-600 dark:text-amber-400/80',
  },
  critical: {
    container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/30',
    icon: 'text-red-500',
    title: 'text-red-700 dark:text-red-300',
    body: 'text-red-600 dark:text-red-400/80',
  },
} as const

const SEVERITY_ICONS = {
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  critical: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

interface AnnouncementBannerProps {
  announcement: DaoAnnouncement
}

export function AnnouncementBanner({ announcement }: AnnouncementBannerProps) {
  const styles = SEVERITY_STYLES[announcement.severity]
  const iconPath = SEVERITY_ICONS[announcement.severity]

  return (
    <div className={`rounded-xl border px-5 py-4 ${styles.container}`}>
      <div className="flex items-start gap-3">
        <svg
          aria-hidden="true"
          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${styles.title}`}>
              {announcement.title}
            </h3>
            <span className="text-xs text-dao-text-hint flex-shrink-0">
              {formatTimeAgo(new Date(announcement.createdAt).getTime())}
            </span>
          </div>
          {announcement.body && (
            <p className={`text-sm mt-1 ${styles.body}`}>
              <SafeMarkdown>{announcement.body}</SafeMarkdown>
            </p>
          )}
          {announcement.url && (
            <a
              href={safeHref(announcement.url)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`inline-flex items-center gap-1 text-sm mt-1.5 hover:underline ${styles.title}`}
            >
              Learn more
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

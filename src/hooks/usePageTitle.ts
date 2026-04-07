import { useEffect } from 'react'

const BASE_TITLE = 'DAOShips'

/**
 * Sets the document title. Resets to base title on unmount.
 * Pass segments to build "Proposals | My DAO | DAOShips" style titles.
 */
export function usePageTitle(...segments: (string | undefined | null)[]) {
  const filtered = segments.filter(Boolean) as string[]
  const title = filtered.length > 0 ? `${filtered.join(' | ')} | ${BASE_TITLE}` : BASE_TITLE

  useEffect(() => {
    document.title = title
    return () => { document.title = BASE_TITLE }
  }, [title])
}

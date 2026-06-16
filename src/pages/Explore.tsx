import { useState, useMemo, useEffect } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useDaos } from '@/hooks/useDaos'
import { useDebounce } from '@/hooks/useDebounce'
import { DaoCard } from '@/components/dao/DaoCard'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonDaoCard } from '@/components/common/Skeleton'
import type { Dao } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// Explore - Filterable/sortable DAO list with search
// ═══════════════════════════════════════════════════════════════════════════

const DAOS_PER_PAGE = 24

type SortOption = 'newest' | 'members' | 'proposals'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'members', label: 'Most Members' },
  { value: 'proposals', label: 'Most Proposals' },
]

function sortDaos(daos: Dao[], sortBy: SortOption): Dao[] {
  const sorted = [...daos]
  switch (sortBy) {
    case 'newest':
      return sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    case 'members':
      return sorted.sort(
        (a, b) => Number(b.active_member_count || '0') - Number(a.active_member_count || '0'),
      )
    case 'proposals':
      return sorted.sort(
        (a, b) => Number(b.proposal_count || '0') - Number(a.proposal_count || '0'),
      )
  }
}

export function Explore() {
  usePageTitle('Explore DAOs')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)
  const { data: daos, isLoading, error } = useDaos()

  // Reset page when search changes
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const filteredDaos = useMemo(() => {
    if (!daos) return []

    let filtered = daos
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase()
      filtered = daos.filter(
        (dao) =>
          dao.name?.toLowerCase().includes(lower) ||
          dao.description?.toLowerCase().includes(lower) ||
          dao.id.toLowerCase().includes(lower),
      )
    }

    return sortDaos(filtered, sortBy)
  }, [daos, debouncedSearch, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredDaos.length / DAOS_PER_PAGE))
  const paginatedDaos = useMemo(
    () => filteredDaos.slice((page - 1) * DAOS_PER_PAGE, page * DAOS_PER_PAGE),
    [filteredDaos, page],
  )

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold font-display text-dao-text">Explore DAOs</h1>
        <p className="text-dao-text-muted mt-1">
          Discover and join decentralized organizations on Quai Network.
        </p>
      </div>

      {/* Search and sort controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dao-text-hint pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, description, or address..."
            className="input w-full pl-9"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="input w-full sm:w-48"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => <SkeletonDaoCard key={i} />)}
        </div>
      ) : error ? (
        <EmptyState
          title="Failed to load DAOs"
          description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        />
      ) : filteredDaos.length > 0 ? (
        <>
          <p className="text-sm text-dao-text-hint">
            {filteredDaos.length} {filteredDaos.length === 1 ? 'DAO' : 'DAOs'} found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedDaos.map((dao) => (
              <DaoCard key={dao.id} dao={dao} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">Previous</button>
              <span className="text-sm text-dao-text-muted">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="No DAOs found"
          description={
            debouncedSearch
              ? `No DAOs match "${debouncedSearch}". Try a different search term.`
              : 'No DAOs have been launched yet.'
          }
        />
      )}
    </div>
  )
}

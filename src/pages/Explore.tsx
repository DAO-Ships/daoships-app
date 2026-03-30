import { useState, useMemo } from 'react'
import { useDaos } from '@/hooks/useDaos'
import { useDebounce } from '@/hooks/useDebounce'
import { DaoCard } from '@/components/dao/DaoCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Loading } from '@/components/common/Loading'
import type { Dao } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// Explore - Filterable/sortable DAO list with search
// ═══════════════════════════════════════════════════════════════════════════

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
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const debouncedSearch = useDebounce(search, 300)
  const { data: daos, isLoading, error } = useDaos(debouncedSearch)

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
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, description, or address..."
            className="input w-full"
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
        <Loading fullPage />
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
            {filteredDaos.map((dao) => (
              <DaoCard key={dao.id} dao={dao} />
            ))}
          </div>
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

import { Link, useOutletContext } from 'react-router-dom'
import type { Dao } from '@/types'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { Card } from '@/components/common/Card'
import { Loading } from '@/components/common/Loading'
import { EmptyState } from '@/components/common/EmptyState'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { NETWORK_CONFIG, NATIVE_TOKEN_SENTINEL } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// Treasury - Guild token balances and vault address
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

export function Treasury() {
  const { dao } = useOutletContext<DaoContext>()
  const { data: treasury, isLoading, error } = useTreasury(dao.id)
  const { data: balances, isLoading: balancesLoading, error: balancesError } = useTreasuryBalances(dao.avatar, treasury)

  const vaultUrl = `${NETWORK_CONFIG.quaiVaultUrl}/wallet/${dao.avatar}`

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dao-text-hint">
        <Link to={`/dao/${dao.id}`} className="hover:text-primary-400 transition-colors">
          {dao.name || `DAO ${dao.id.slice(0, 8)}...`}
        </Link>
        <span>/</span>
        <span className="text-dao-text-secondary">Treasury</span>
      </nav>

      <h1 className="text-2xl font-bold font-display text-dao-text">Treasury</h1>

      {/* Vault address */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-dao-text-hint mb-1">Vault Address (Gnosis Safe)</p>
            <AddressDisplay address={dao.avatar} />
          </div>
          <a
            href={vaultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            Open in QuaiVault
          </a>
        </div>
      </Card>

      {/* Native QUAI balance */}
      <Card>
        <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-1">Vault Native Balance</p>
        {balancesLoading ? (
          <span className="text-xl font-bold text-dao-text-hint">Loading...</span>
        ) : balancesError ? (
          <span className="text-sm text-red-400">
            Failed to load balance: {balancesError instanceof Error ? balancesError.message : 'Unknown error'}
          </span>
        ) : balances ? (
          <TokenAmount
            amount={balances.nativeBalance}
            symbol="QUAI"
            className="text-xl font-bold text-dao-text"
          />
        ) : (
          <span className="text-2xl font-bold font-display text-dao-text-hint">--</span>
        )}
      </Card>

      {/* Token overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-1">Total Shares</p>
          <TokenAmount
            amount={dao.total_shares}
            symbol={dao.share_token_symbol || 'SHARES'}
            className="text-xl font-bold text-dao-text"
          />
          {dao.share_token_name && (
            <p className="text-xs text-dao-text-hint mt-1">{dao.share_token_name}</p>
          )}
          <p className="text-xs text-dao-text-hint mt-1">
            {dao.shares_paused ? 'Transfers paused' : 'Transfers enabled'}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-1">Total Loot</p>
          <TokenAmount
            amount={dao.total_loot}
            symbol={dao.loot_token_symbol || 'LOOT'}
            className="text-xl font-bold text-dao-text"
          />
          {dao.loot_token_name && (
            <p className="text-xs text-dao-text-hint mt-1">{dao.loot_token_name}</p>
          )}
          <p className="text-xs text-dao-text-hint mt-1">
            {dao.loot_paused ? 'Transfers paused' : 'Transfers enabled'}
          </p>
        </Card>
      </div>

      {/* Guild token balances */}
      <section>
        <h2 className="text-xl font-semibold text-dao-text mb-4">Guild Token Balances</h2>

        {isLoading ? (
          <Loading fullPage />
        ) : error ? (
          <EmptyState
            title="Failed to load treasury"
            description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
          />
        ) : treasury && Array.isArray(treasury) && treasury.length > 0 ? (
          <Card>
            <div className="divide-y divide-dao-border">
              {treasury.map((token) => {
                const addr = token.token_address.toLowerCase()
                const isNative = addr === NATIVE_TOKEN_SENTINEL.toLowerCase()
                  || addr === '0x0000000000000000000000000000000000000000'
                const tokenBalance = balances?.tokenBalances.find(
                  (b) => b.address.toLowerCase() === addr,
                )
                const displayName = isNative
                  ? NETWORK_CONFIG.nativeCurrency.name
                  : (tokenBalance?.name ?? tokenBalance?.symbol ?? null)
                const displaySymbol = isNative
                  ? NETWORK_CONFIG.nativeCurrency.symbol
                  : (tokenBalance?.symbol ?? null)
                const displayBalance = isNative
                  ? (tokenBalance?.balance ?? balances?.nativeBalance)
                  : tokenBalance?.balance
                const displayDecimals = isNative
                  ? NETWORK_CONFIG.nativeCurrency.decimals
                  : (tokenBalance?.decimals ?? 18)

                return (
                  <div
                    key={token.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-dao-surface flex items-center justify-center flex-shrink-0">
                        <span className={`text-xs font-bold ${isNative ? 'text-primary-400' : 'text-dao-text-muted'}`}>
                          {isNative
                            ? NETWORK_CONFIG.nativeCurrency.symbol.charAt(0)
                            : (displaySymbol?.charAt(0) ?? '?')}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-dao-text">
                            {displayName ?? 'Loading...'}
                          </span>
                          {displaySymbol && displaySymbol !== displayName && (
                            <span className="text-xs text-dao-text-hint">
                              {displaySymbol}
                            </span>
                          )}
                        </div>
                        {isNative ? (
                          <p className="text-xs text-dao-text-hint">Network Token</p>
                        ) : (
                          <AddressDisplay address={token.token_address} showCopy={false} />
                        )}
                        {displayBalance != null && (
                          <TokenAmount
                            amount={displayBalance}
                            decimals={displayDecimals}
                            className="text-sm text-dao-text-secondary mt-0.5"
                          />
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${token.enabled ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-dao-surface text-dao-text-hint'}`}>
                      {token.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No guild tokens"
            description="This DAO has not registered any guild tokens for ragequit."
          />
        )}
      </section>

      {/* Token contract addresses */}
      <Card header={<h2 className="text-sm font-semibold text-dao-text">Token Contracts</h2>}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-dao-text-hint">Shares Token</span>
            <AddressDisplay address={dao.shares_address} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dao-text-hint">Loot Token</span>
            <AddressDisplay address={dao.loot_address} />
          </div>
        </div>
      </Card>
    </div>
  )
}

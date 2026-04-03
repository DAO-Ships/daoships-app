import { useOutletContext } from 'react-router-dom'
import type { Dao } from '@/types'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { useMember } from '@/hooks/useMember'
import { useWallet } from '@/hooks/useWallet'
import { Card } from '@/components/common/Card'
import { Loading } from '@/components/common/Loading'
import { EmptyState } from '@/components/common/EmptyState'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { AddressDisplay } from '@/components/common/AddressDisplay'
import { TokenAmount } from '@/components/common/TokenAmount'
import { formatTokenAmount } from '@/utils/format'
import { safeBigInt } from '@/utils/bigint'
import { NETWORK_CONFIG, NATIVE_TOKEN_SENTINEL } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// Treasury - Guild token balances, vault address, and member share estimate
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

export function Treasury() {
  const { dao } = useOutletContext<DaoContext>()
  const { data: treasury, isLoading, error } = useTreasury(dao.id)
  const { data: balances, isLoading: balancesLoading, error: balancesError } = useTreasuryBalances(dao.avatar, treasury)
  const { address } = useWallet()
  const { data: currentMember } = useMember(dao.id, address ?? undefined)

  const vaultUrl = `${NETWORK_CONFIG.quaiVaultUrl}/wallet/${dao.avatar}`

  // "Your Share" calculation
  const totalShares = safeBigInt(dao.total_shares)
  const memberShares = currentMember ? safeBigInt(currentMember.shares) : 0n
  const memberPct = totalShares > 0n && memberShares > 0n
    ? Number((memberShares * 10000n) / totalShares) / 100
    : 0
  const memberQuaiShare = balances && totalShares > 0n && memberShares > 0n
    ? (balances.nativeBalance * memberShares) / totalShares
    : null

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: dao.name || `DAO ${dao.id.slice(0, 8)}...`, href: `/dao/${dao.id}` },
        { label: 'Treasury' },
      ]} />

      <h1 className="text-2xl font-bold font-display text-dao-text">Treasury</h1>

      {/* Vault address */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-dao-text-hint mb-1">Vault Address (Gnosis Safe)</p>
            <AddressDisplay address={dao.avatar} />
          </div>
          <a href={vaultUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
            Open in QuaiVault
          </a>
        </div>
      </Card>

      {/* Native balance + Your Share */}
      <div className={`grid gap-4 ${memberQuaiShare != null ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <Card>
          <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-2">Vault Native Balance</p>
          {balancesLoading ? (
            <span className="text-3xl font-bold font-display text-dao-text-hint">--</span>
          ) : balancesError ? (
            <span className="text-sm text-red-400">Failed to load balance</span>
          ) : balances ? (
            <TokenAmount
              amount={balances.nativeBalance}
              symbol="QUAI"
              className="text-3xl font-bold font-display text-accent-400"
            />
          ) : (
            <span className="text-3xl font-bold font-display text-dao-text-hint">--</span>
          )}
        </Card>

        {memberQuaiShare != null && (
          <Card>
            <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-2">Your Proportional Share</p>
            <p className="text-2xl font-bold font-display text-dao-text">
              ~{formatTokenAmount(memberQuaiShare)} <span className="text-lg text-dao-text-muted">QUAI</span>
            </p>
            <p className="text-xs text-dao-text-hint mt-1">
              Based on {memberPct.toFixed(2)}% ownership ({formatTokenAmount(memberShares)} shares)
            </p>
          </Card>
        )}
      </div>

      {/* Shares + Loot totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-dao-text-hint uppercase tracking-wider mb-1">Total Shares</p>
          <TokenAmount
            amount={dao.total_shares}
            symbol={dao.share_token_symbol || 'SHARES'}
            className="text-xl font-bold text-dao-text"
          />
          {dao.share_token_name && <p className="text-xs text-dao-text-hint mt-1">{dao.share_token_name}</p>}
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
          {dao.loot_token_name && <p className="text-xs text-dao-text-hint mt-1">{dao.loot_token_name}</p>}
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
        ) : treasury && Array.isArray(treasury) && treasury.filter((t) => t.enabled).length > 0 ? (
          <Card>
            <div className="divide-y divide-dao-border">
              {treasury.filter((t) => t.enabled).map((token) => {
                const addr = token.token_address.toLowerCase()
                const isNative = addr === NATIVE_TOKEN_SENTINEL.toLowerCase()
                  || addr === '0x0000000000000000000000000000000000000000'
                const tokenBalance = balances?.tokenBalances.find((b) => b.address.toLowerCase() === addr)
                const displayName = isNative ? NETWORK_CONFIG.nativeCurrency.name : (tokenBalance?.name ?? tokenBalance?.symbol ?? null)
                const displaySymbol = isNative ? NETWORK_CONFIG.nativeCurrency.symbol : (tokenBalance?.symbol ?? null)
                const displayBalance = isNative ? (tokenBalance?.balance ?? balances?.nativeBalance) : tokenBalance?.balance
                const displayDecimals = isNative ? NETWORK_CONFIG.nativeCurrency.decimals : (tokenBalance?.decimals ?? 18)

                return (
                  <div key={token.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-dao-surface flex items-center justify-center flex-shrink-0">
                        <span className={`text-sm font-bold ${isNative ? 'text-primary-400' : 'text-dao-text-muted'}`}>
                          {isNative ? NETWORK_CONFIG.nativeCurrency.symbol.charAt(0) : (displaySymbol?.charAt(0) ?? '?')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-dao-text">{displayName ?? 'Loading...'}</span>
                          {displaySymbol && displaySymbol !== displayName && (
                            <span className="text-xs text-dao-text-hint">{displaySymbol}</span>
                          )}
                        </div>
                        {isNative ? (
                          <p className="text-xs text-dao-text-hint">Network Token</p>
                        ) : (
                          <div className="mt-0.5"><AddressDisplay address={token.token_address} /></div>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {displayBalance != null ? (
                        <TokenAmount
                          amount={displayBalance}
                          decimals={displayDecimals}
                          symbol={displaySymbol ?? undefined}
                          className="text-base font-mono font-semibold text-dao-text"
                        />
                      ) : balancesLoading ? (
                        <span className="text-sm text-dao-text-hint">...</span>
                      ) : null}
                    </div>
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

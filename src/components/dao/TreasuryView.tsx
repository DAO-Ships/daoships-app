import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { TokenAmount } from '@/components/common/TokenAmount'
import { NETWORK_CONFIG } from '@/config/contracts'

// ═══════════════════════════════════════════════════════════════════════════
// TreasuryView - List of guild tokens with balances in the vault
// ═══════════════════════════════════════════════════════════════════════════

interface TreasuryViewProps {
  daoId: string
  vaultAddress: string
}

export function TreasuryView({ daoId, vaultAddress }: TreasuryViewProps) {
  const { data: treasury, isLoading, error } = useTreasury(daoId)
  const { data: balances } = useTreasuryBalances(vaultAddress, treasury)

  if (isLoading) {
    return (
      <div className="card px-6 py-8">
        <div className="flex items-center justify-center gap-2 text-dao-text-muted">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading treasury...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card px-6 py-8">
        <p className="text-center text-red-400">Failed to load treasury data</p>
      </div>
    )
  }

  const tokens = treasury ?? []

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-dao-border flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dao-text">Treasury</h3>
        <a
          href={`${NETWORK_CONFIG.quaiVaultUrl}/wallet/${vaultAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-400 hover:text-primary-300 font-mono transition-colors"
          title={vaultAddress}
        >
          {vaultAddress.slice(0, 6)}...{vaultAddress.slice(-4)}
        </a>
      </div>

      {/* Native QUAI balance */}
      {balances && (
        <div className="px-6 py-3 border-b border-dao-border flex items-center justify-between">
          <span className="text-sm font-medium text-dao-text-secondary">QUAI</span>
          <TokenAmount
            amount={balances.nativeBalance}
            symbol="QUAI"
            className="text-sm text-dao-text-secondary"
          />
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="px-6 py-8 text-center text-dao-text-hint">
          No tokens in the treasury
        </div>
      ) : (
        <div className="divide-y divide-dao-border">
          {tokens.map((token) => {
            const tokenBalance = balances?.tokenBalances.find(
              (b) => b.address.toLowerCase() === token.token_address.toLowerCase(),
            )
            return (
              <div
                key={token.id}
                className="px-6 py-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dao-text-secondary">
                    {tokenBalance?.symbol ?? 'Guild Token'}
                  </p>
                  <p className="text-xs text-dao-text-hint font-mono truncate">
                    {token.token_address}
                  </p>
                  {tokenBalance && (
                    <TokenAmount
                      amount={tokenBalance.balance}
                      decimals={tokenBalance.decimals}
                      className="text-xs text-dao-text-muted mt-0.5"
                    />
                  )}
                </div>
                <span className={`text-sm font-medium flex-shrink-0 ${token.enabled ? 'text-green-400' : 'text-dao-text-hint'}`}>
                  {token.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { Control, FieldErrors } from 'react-hook-form'
import { useController } from 'react-hook-form'
import type { LaunchFormValues } from './BasicInfoStep'
import { AllowlistInput } from '@/components/common/AllowlistInput'

// ═══════════════════════════════════════════════════════════════════════════
// NavigatorsStep - Step 4: Configure navigator contracts for deployment
// ═══════════════════════════════════════════════════════════════════════════

interface NavigatorsStepProps {
  control: Control<LaunchFormValues>
  errors: FieldErrors<LaunchFormValues>
}

export function NavigatorsStep({ control, errors: _errors }: NavigatorsStepProps) {
  const enableOnboarder = useController({ control, name: 'enableOnboarder' })
  const onboarderConfig = useController({ control, name: 'onboarderConfig' })
  const enableERC20Tribute = useController({ control, name: 'enableERC20Tribute' })
  const erc20TributeConfig = useController({ control, name: 'erc20TributeConfig' })

  const [showOnboarderAdvanced, setShowOnboarderAdvanced] = useState(false)
  const [showERC20Advanced, setShowERC20Advanced] = useState(false)

  const onboarder = onboarderConfig.field.value
  const erc20 = erc20TributeConfig.field.value

  const updateOnboarder = (patch: Partial<typeof onboarder>) => {
    onboarderConfig.field.onChange({ ...onboarder, ...patch })
  }

  const updateERC20 = (patch: Partial<typeof erc20>) => {
    erc20TributeConfig.field.onChange({ ...erc20, ...patch })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-dao-text mb-1">Navigators</h2>
        <p className="text-sm text-dao-text-muted">
          Navigators are smart contracts deployed alongside your DAO that extend its capabilities.
          Enable the ones you need -- they will be deployed as part of the launch process.
        </p>
      </div>

      {/* ── OnboarderNavigator Card ──────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-dao-text">Onboarder Navigator</h3>
            <p className="text-xs text-dao-text-hint mt-0.5">
              Allows new members to join by sending QUAI tribute in exchange for shares/loot
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
            <input
              type="checkbox"
              checked={enableOnboarder.field.value}
              onChange={(e) => enableOnboarder.field.onChange(e.target.checked)}
              className="sr-only peer"
              aria-label="Enable Onboarder Navigator"
            />
            <div className="w-11 h-6 bg-dao-dark-3 rounded-full peer peer-checked:bg-accent-500 peer-focus:ring-2 peer-focus:ring-accent-500/50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        {enableOnboarder.field.value && (
          <div className="px-6 pb-5 border-t border-dao-border pt-4 space-y-5">
            {/* Navigator name + description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Name</label>
                <input
                  type="text"
                  value={onboarder.navigatorName}
                  onChange={(e) => updateOnboarder({ navigatorName: e.target.value })}
                  placeholder="e.g. Open Onboarding"
                  maxLength={64}
                  className="input w-full"
                />
                <p className="text-xs text-dao-text-hint mt-1">{onboarder.navigatorName.length}/64</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Description</label>
                <input
                  type="text"
                  value={onboarder.navigatorDescription}
                  onChange={(e) => updateOnboarder({ navigatorDescription: e.target.value })}
                  placeholder="e.g. 2x share multiplier, 0.01 QUAI minimum"
                  maxLength={280}
                  className="input w-full"
                />
                <p className="text-xs text-dao-text-hint mt-1">{onboarder.navigatorDescription.length}/280</p>
              </div>
            </div>

            {/* Mode selector */}
            <div>
              <label className="block text-sm font-medium text-dao-text-secondary mb-2">Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="onboarder-mode"
                    checked={onboarder.mode === 'multiplier'}
                    onChange={() => updateOnboarder({ mode: 'multiplier' })}
                    className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-dao-text-secondary">Multiplier</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="onboarder-mode"
                    checked={onboarder.mode === 'fixedPrice'}
                    onChange={() => updateOnboarder({ mode: 'fixedPrice' })}
                    className="w-4 h-4 text-accent-500 border-dao-border bg-dao-dark-3 focus:ring-accent-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-dao-text-secondary">Fixed Price</span>
                </label>
              </div>
            </div>

            {/* Multiplier mode fields */}
            {onboarder.mode === 'multiplier' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ob-share-mult" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Share Multiplier
                    </label>
                    <input
                      id="ob-share-mult"
                      type="text"
                      value={onboarder.shareMultiplier}
                      onChange={(e) => updateOnboarder({ shareMultiplier: e.target.value })}
                      placeholder="10000"
                      className="input w-full"
                    />
                    <p className="text-xs text-dao-text-hint mt-1">
                      Basis points: 10000 = 1x, 20000 = 2x, 5000 = 0.5x
                    </p>
                  </div>
                  <div>
                    <label htmlFor="ob-loot-mult" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Loot Multiplier
                    </label>
                    <input
                      id="ob-loot-mult"
                      type="text"
                      value={onboarder.lootMultiplier}
                      onChange={(e) => updateOnboarder({ lootMultiplier: e.target.value })}
                      placeholder="0"
                      className="input w-full"
                    />
                    <p className="text-xs text-dao-text-hint mt-1">
                      0 = no loot issued per tribute
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="ob-min-tribute" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                    Minimum Tribute (QUAI)
                  </label>
                  <input
                    id="ob-min-tribute"
                    type="text"
                    value={onboarder.minTribute}
                    onChange={(e) => updateOnboarder({ minTribute: e.target.value })}
                    placeholder="0.1"
                    className="input w-full"
                  />
                </div>
              </div>
            )}

            {/* Fixed-price mode fields */}
            {onboarder.mode === 'fixedPrice' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="ob-price" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                    Price Per Unit (QUAI)
                  </label>
                  <input
                    id="ob-price"
                    type="text"
                    value={onboarder.pricePerUnit}
                    onChange={(e) => updateOnboarder({ pricePerUnit: e.target.value })}
                    placeholder="1"
                    className="input w-full"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ob-shares-per" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Shares Per Unit
                    </label>
                    <input
                      id="ob-shares-per"
                      type="text"
                      value={onboarder.sharesPerUnit}
                      onChange={(e) => updateOnboarder({ sharesPerUnit: e.target.value })}
                      placeholder="1"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor="ob-loot-per" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Loot Per Unit
                    </label>
                    <input
                      id="ob-loot-per"
                      type="text"
                      value={onboarder.lootPerUnit}
                      onChange={(e) => updateOnboarder({ lootPerUnit: e.target.value })}
                      placeholder="0"
                      className="input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="ob-min-tribute-fp" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                    Minimum Tribute (QUAI)
                  </label>
                  <input
                    id="ob-min-tribute-fp"
                    type="text"
                    value={onboarder.minTribute}
                    onChange={(e) => updateOnboarder({ minTribute: e.target.value })}
                    placeholder="0.1"
                    className="input w-full"
                  />
                </div>
              </div>
            )}

            {/* Advanced settings (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowOnboarderAdvanced(!showOnboarderAdvanced)}
                className="flex items-center gap-2 text-sm text-dao-text-muted hover:text-dao-text transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showOnboarderAdvanced ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Advanced Settings
              </button>

              {showOnboarderAdvanced && (
                <div className="mt-3 space-y-4 pl-6 border-l-2 border-dao-border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ob-mint-cap" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                        Mint Cap
                      </label>
                      <input
                        id="ob-mint-cap"
                        type="text"
                        value={onboarder.mintCap}
                        onChange={(e) => updateOnboarder({ mintCap: e.target.value })}
                        placeholder="0"
                        className="input w-full"
                      />
                      <p className="text-xs text-dao-text-hint mt-1">Total mints allowed (0 = unlimited)</p>
                    </div>
                    <div>
                      <label htmlFor="ob-addr-cap" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                        Per-Address Cap
                      </label>
                      <input
                        id="ob-addr-cap"
                        type="text"
                        value={onboarder.perAddressCap}
                        onChange={(e) => updateOnboarder({ perAddressCap: e.target.value })}
                        placeholder="0"
                        className="input w-full"
                      />
                      <p className="text-xs text-dao-text-hint mt-1">Max mints per address (0 = unlimited)</p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ob-expiry" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Expiry Date
                    </label>
                    <input
                      id="ob-expiry"
                      type="datetime-local"
                      value={onboarder.expiry ? new Date(Number(onboarder.expiry) * 1000).toISOString().slice(0, 16) : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          const timestamp = Math.floor(new Date(e.target.value).getTime() / 1000)
                          updateOnboarder({ expiry: String(timestamp) })
                        } else {
                          updateOnboarder({ expiry: '' })
                        }
                      }}
                      className="input w-full"
                    />
                    <p className="text-xs text-dao-text-hint mt-1">
                      When this navigator stops accepting new members. Leave empty for no expiry.
                      After this date, onboard transactions will revert.
                    </p>
                  </div>

                  {/* Warnings */}
                  {(onboarder.mintCap === '0' || onboarder.mintCap === '') && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
                      <p className="text-xs text-amber-400">
                        Mint cap is unlimited. Anyone can mint without a total cap.
                      </p>
                    </div>
                  )}
                  {(onboarder.perAddressCap === '0' || onboarder.perAddressCap === '') && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
                      <p className="text-xs text-amber-400">
                        Per-address cap is unlimited. A single address can mint without restriction.
                      </p>
                    </div>
                  )}

                  {/* Allowlist */}
                  <AllowlistInput
                    value={onboarder.allowlistAddresses}
                    onChange={(v) => updateOnboarder({ allowlistAddresses: v })}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── ERC20TributeNavigator Card ───────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-dao-text">ERC-20 Tribute Navigator</h3>
            <p className="text-xs text-dao-text-hint mt-0.5">
              Allows new members to join by sending an ERC-20 token tribute in exchange for shares/loot
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
            <input
              type="checkbox"
              checked={enableERC20Tribute.field.value}
              onChange={(e) => enableERC20Tribute.field.onChange(e.target.checked)}
              className="sr-only peer"
              aria-label="Enable ERC-20 Tribute Navigator"
            />
            <div className="w-11 h-6 bg-dao-dark-3 rounded-full peer peer-checked:bg-accent-500 peer-focus:ring-2 peer-focus:ring-accent-500/50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        {enableERC20Tribute.field.value && (
          <div className="px-6 pb-5 border-t border-dao-border pt-4 space-y-4">
            {/* Navigator name + description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Name</label>
                <input
                  type="text"
                  value={erc20.navigatorName}
                  onChange={(e) => updateERC20({ navigatorName: e.target.value })}
                  placeholder="e.g. USDT Tribute"
                  maxLength={64}
                  className="input w-full"
                />
                <p className="text-xs text-dao-text-hint mt-1">{erc20.navigatorName.length}/64</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-dao-text-secondary mb-1.5">Description</label>
                <input
                  type="text"
                  value={erc20.navigatorDescription}
                  onChange={(e) => updateERC20({ navigatorDescription: e.target.value })}
                  placeholder="e.g. Pay USDT for shares"
                  maxLength={280}
                  className="input w-full"
                />
                <p className="text-xs text-dao-text-hint mt-1">{erc20.navigatorDescription.length}/280</p>
              </div>
            </div>

            <div>
              <label htmlFor="erc20-token" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                Tribute Token Address
              </label>
              <input
                id="erc20-token"
                type="text"
                value={erc20.tributeToken}
                onChange={(e) => updateERC20({ tributeToken: e.target.value })}
                placeholder="0x..."
                className="input w-full font-mono text-sm"
              />
              <p className="text-xs text-dao-text-hint mt-1">The ERC-20 token that members will send as tribute</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="erc20-price-share" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                  Price Per Share
                </label>
                <input
                  id="erc20-price-share"
                  type="text"
                  value={erc20.pricePerShare}
                  onChange={(e) => updateERC20({ pricePerShare: e.target.value })}
                  placeholder="1"
                  className="input w-full"
                />
                <p className="text-xs text-dao-text-hint mt-1">In token decimals (e.g. "1" = 1 token per share)</p>
              </div>
              <div>
                <label htmlFor="erc20-price-loot" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                  Price Per Loot
                </label>
                <input
                  id="erc20-price-loot"
                  type="text"
                  value={erc20.pricePerLoot}
                  onChange={(e) => updateERC20({ pricePerLoot: e.target.value })}
                  placeholder="0"
                  className="input w-full"
                />
                <p className="text-xs text-dao-text-hint mt-1">0 = loot not available for purchase</p>
              </div>
            </div>

            {/* Advanced settings (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowERC20Advanced(!showERC20Advanced)}
                className="flex items-center gap-2 text-sm text-dao-text-muted hover:text-dao-text transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showERC20Advanced ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Advanced Settings
              </button>

              {showERC20Advanced && (
                <div className="mt-3 space-y-4 pl-6 border-l-2 border-dao-border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="erc20-mint-cap" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                        Mint Cap
                      </label>
                      <input
                        id="erc20-mint-cap"
                        type="text"
                        value={erc20.mintCap}
                        onChange={(e) => updateERC20({ mintCap: e.target.value })}
                        placeholder="0"
                        className="input w-full"
                      />
                      <p className="text-xs text-dao-text-hint mt-1">Total mints allowed (0 = unlimited)</p>
                    </div>
                    <div>
                      <label htmlFor="erc20-addr-cap" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                        Per-Address Cap
                      </label>
                      <input
                        id="erc20-addr-cap"
                        type="text"
                        value={erc20.perAddressCap}
                        onChange={(e) => updateERC20({ perAddressCap: e.target.value })}
                        placeholder="0"
                        className="input w-full"
                      />
                      <p className="text-xs text-dao-text-hint mt-1">Max mints per address (0 = unlimited)</p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="erc20-expiry" className="block text-sm font-medium text-dao-text-secondary mb-1.5">
                      Expiry Date
                    </label>
                    <input
                      id="erc20-expiry"
                      type="datetime-local"
                      value={erc20.expiry ? new Date(Number(erc20.expiry) * 1000).toISOString().slice(0, 16) : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          const timestamp = Math.floor(new Date(e.target.value).getTime() / 1000)
                          updateERC20({ expiry: String(timestamp) })
                        } else {
                          updateERC20({ expiry: '' })
                        }
                      }}
                      className="input w-full"
                    />
                    <p className="text-xs text-dao-text-hint mt-1">
                      When this navigator stops accepting new members. Leave empty for no expiry.
                      After this date, onboard transactions will revert.
                    </p>
                  </div>

                  {/* Warnings */}
                  {(erc20.mintCap === '0' || erc20.mintCap === '') && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
                      <p className="text-xs text-amber-400">
                        Mint cap is unlimited. Anyone can mint without a total cap.
                      </p>
                    </div>
                  )}
                  {(erc20.perAddressCap === '0' || erc20.perAddressCap === '') && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
                      <p className="text-xs text-amber-400">
                        Per-address cap is unlimited. A single address can mint without restriction.
                      </p>
                    </div>
                  )}

                  {/* Allowlist */}
                  <AllowlistInput
                    value={erc20.allowlistAddresses}
                    onChange={(v) => updateERC20({ allowlistAddresses: v })}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info note */}
      {!enableOnboarder.field.value && !enableERC20Tribute.field.value && (
        <div className="flex items-start gap-3 px-4 py-3 bg-dao-dark-200/50 rounded-lg">
          <svg className="w-5 h-5 text-dao-text-hint flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-dao-text-hint">
            No navigators enabled. You can skip this step and add navigators later via governance proposals.
          </p>
        </div>
      )}
    </div>
  )
}

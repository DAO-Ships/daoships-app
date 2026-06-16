import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useLaunch } from '@/hooks/useLaunch'
import { useWallet } from '@/hooks/useWallet'
import { parseTokenAmount } from '@/utils/format'
import { NATIVE_TOKEN_SENTINEL, MAX_GUILD_TOKENS } from '@/config/contracts'
import { parseDurationToSeconds } from '@/utils/time'
import type { DaoTheme } from '@/utils/daoTheme'
import { isAddress } from '@/services/utils/AddressUtils'
import { parseAllowlistInput } from '@/utils/allowlist'
import { MAX_ALLOWLIST_ADDRESSES } from '@/components/common/AllowlistInput'
import { Button } from '@/components/common/Button'
import { BasicInfoStep } from './steps/BasicInfoStep'
import { MembersStep } from './steps/MembersStep'
import { GovernanceStep } from './steps/GovernanceStep'
import { NavigatorsStep } from './steps/NavigatorsStep'
import { GuildTokensStep } from './steps/GuildTokensStep'
import { VaultStep } from './steps/VaultStep'
import { ReviewStep } from './steps/ReviewStep'
import type { LaunchFormValues } from './steps/BasicInfoStep'

// ═══════════════════════════════════════════════════════════════════════════
// LaunchWizard - Multi-step wizard for creating a new DAO
// ═══════════════════════════════════════════════════════════════════════════

const STEPS = [
  { key: 'basic', label: 'Basic Info' },
  { key: 'members', label: 'Members' },
  { key: 'governance', label: 'Governance' },
  { key: 'navigators', label: 'Navigators' },
  { key: 'guildTokens', label: 'Guild Tokens' },
  { key: 'vault', label: 'Vault' },
  { key: 'review', label: 'Review' },
] as const

const DEFAULT_VALUES: LaunchFormValues = {
  name: '',
  description: '',
  avatarUrl: '',
  bannerUrl: '',
  theme: undefined,
  links: {},
  shareTokenName: '',
  shareTokenSymbol: '',
  lootTokenName: '',
  lootTokenSymbol: '',
  pauseSharesOnLaunch: false,
  pauseLootOnLaunch: false,
  members: [{ address: '', shares: '1', loot: '0' }],
  votingPeriodInput: '3 days',
  gracePeriodInput: '1 day',
  quorumPercent: '0',
  proposalOffering: '0',
  sponsorThreshold: '1',
  minRetentionPercent: '0',
  defaultExpiryWindow: '0',
  enableOnboarder: false,
  onboarderConfig: {
    mode: 'multiplier',
    shareMultiplier: '10000',
    lootMultiplier: '0',
    pricePerUnit: '0',
    sharesPerUnit: '0',
    lootPerUnit: '0',
    minTribute: '0.1',
    expiry: '',
    mintCap: '0',
    perAddressCap: '0',
    allowlistAddresses: '',
    navigatorName: '',
    navigatorDescription: '',
  },
  enableERC20Tribute: false,
  erc20TributeConfig: {
    tributeToken: '',
    pricePerShare: '0',
    pricePerLoot: '0',
    expiry: '',
    mintCap: '0',
    perAddressCap: '0',
    allowlistAddresses: '',
    navigatorName: '',
    navigatorDescription: '',
  },
  guildTokens: [],
  vaultOwners: [{ address: '' }],
  vaultThreshold: '1',
}

const FORM_STORAGE_KEY = 'daoships-launch-form'
const STEP_STORAGE_KEY = 'daoships-launch-step'

function saveFormState(values: LaunchFormValues, step: number) {
  try {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(values))
    localStorage.setItem(STEP_STORAGE_KEY, String(step))
  } catch { /* ignore */ }
}

/**
 * Permissive schema for validating localStorage-restored form state.
 * Ensures the structure won't crash the form — real per-step validation
 * happens on submit via dedicated Zod schemas in validation.ts.
 */
const launchFormShape = z.object({
  name: z.string().default(''),
  description: z.string().default(''),
  avatarUrl: z.string().default(''),
  bannerUrl: z.string().default(''),
  theme: z.custom<DaoTheme>().optional(),
  links: z.record(z.string()).default({}),
  shareTokenName: z.string().default(''),
  shareTokenSymbol: z.string().default(''),
  lootTokenName: z.string().default(''),
  lootTokenSymbol: z.string().default(''),
  pauseSharesOnLaunch: z.boolean().default(false),
  pauseLootOnLaunch: z.boolean().default(false),
  members: z.array(z.object({
    address: z.string().default(''),
    shares: z.string().default('0'),
    loot: z.string().default('0'),
  })).default([]),
  votingPeriodInput: z.string().default('3 days'),
  gracePeriodInput: z.string().default('1 day'),
  quorumPercent: z.string().default('0'),
  proposalOffering: z.string().default('0'),
  sponsorThreshold: z.string().default('1'),
  minRetentionPercent: z.string().default('0'),
  defaultExpiryWindow: z.string().default('0'),
  enableOnboarder: z.boolean().default(false),
  onboarderConfig: z.object({
    mode: z.enum(['multiplier', 'fixedPrice']).default('multiplier'),
    shareMultiplier: z.string().default('10000'),
    lootMultiplier: z.string().default('0'),
    pricePerUnit: z.string().default('0'),
    sharesPerUnit: z.string().default('0'),
    lootPerUnit: z.string().default('0'),
    minTribute: z.string().default('0.1'),
    expiry: z.string().default(''),
    mintCap: z.string().default('0'),
    perAddressCap: z.string().default('0'),
    allowlistAddresses: z.string().default(''),
    navigatorName: z.string().default(''),
    navigatorDescription: z.string().default(''),
  }).default({}),
  enableERC20Tribute: z.boolean().default(false),
  erc20TributeConfig: z.object({
    tributeToken: z.string().default(''),
    pricePerShare: z.string().default('0'),
    pricePerLoot: z.string().default('0'),
    expiry: z.string().default(''),
    mintCap: z.string().default('0'),
    perAddressCap: z.string().default('0'),
    allowlistAddresses: z.string().default(''),
    navigatorName: z.string().default(''),
    navigatorDescription: z.string().default(''),
  }).default({}),
  guildTokens: z.array(z.object({
    type: z.enum(['native', 'erc20']).default('erc20'),
    address: z.string().default(''),
  })).default([]),
  vaultOwners: z.array(z.object({ address: z.string().default('') })).default([]),
  vaultThreshold: z.string().default('1'),
}).passthrough()

function loadFormState(): { values: LaunchFormValues; step: number } | null {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY)
    const stepRaw = localStorage.getItem(STEP_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Validate structure — returns defaults for missing/invalid fields
    const result = launchFormShape.safeParse(parsed)
    if (!result.success) return null
    const values = result.data as LaunchFormValues
    const step = stepRaw ? parseInt(stepRaw, 10) : 0
    // Only resume if the user made meaningful progress (advanced past step 0 or entered a name)
    if (step === 0 && !values.name?.trim()) return null
    return { values, step }
  } catch { return null }
}

// eslint-disable-next-line react-refresh/only-export-components -- launch-state helper intentionally co-located with the wizard; dev-only Fast Refresh nicety
export function clearLaunchState() {
  try {
    localStorage.removeItem(FORM_STORAGE_KEY)
    localStorage.removeItem(STEP_STORAGE_KEY)
    localStorage.removeItem('daoships-launch-pipeline')
  } catch { /* ignore */ }
}

export function LaunchWizard() {
  // Restore saved form state if returning to an interrupted launch
  const [savedState] = useState(() => loadFormState())
  const [showResumed, setShowResumed] = useState(!!savedState)

  const [currentStep, setCurrentStep] = useState(() => savedState?.step ?? 0)
  const [stepError, setStepError] = useState<string | null>(null)
  const [launchComplete, setLaunchComplete] = useState(false)
  const { launch, isLaunching, error: launchError } = useLaunch()
  const { connected, address: _address } = useWallet()

  const {
    control,
    handleSubmit: _handleSubmit,
    formState: { errors },
    getValues,
    setValue,
    trigger,
    reset,
  } = useForm<LaunchFormValues>({
    defaultValues: savedState?.values ?? DEFAULT_VALUES,
    mode: 'onBlur',
  })

  // Save form state when navigating between steps
  const saveCurrentState = useCallback(() => {
    saveFormState(getValues(), currentStep)
  }, [getValues, currentStep])

  // Auto-save on step change
  useEffect(() => {
    saveCurrentState()
    // Clear any step-level validation error when the active step changes
    setStepError(null)
  }, [currentStep, saveCurrentState])

  // Clear all state on successful launch
  useEffect(() => {
    if (launchComplete) {
      clearLaunchState()
    }
  }, [launchComplete])

  // Validate current step before moving forward
  const validateCurrentStep = async (): Promise<boolean> => {
    switch (currentStep) {
      case 0:
        return trigger(['name', 'description', 'shareTokenName', 'shareTokenSymbol', 'lootTokenName', 'lootTokenSymbol'])
      case 1:
        return trigger('members')
      case 2:
        return trigger(['votingPeriodInput', 'gracePeriodInput', 'quorumPercent', 'proposalOffering', 'sponsorThreshold', 'minRetentionPercent', 'defaultExpiryWindow'])
      case 3: {
        // Validate navigator configs when enabled
        const data = getValues()
        if (data.enableOnboarder) {
          const ob = data.onboarderConfig
          if (ob.mode === 'multiplier') {
            const mult = parseInt(ob.shareMultiplier || '0', 10)
            if (isNaN(mult) || mult <= 0) {
              return false
            }
          } else {
            const price = parseFloat(ob.pricePerUnit || '0')
            const shares = parseInt(ob.sharesPerUnit || '0', 10)
            const loot = parseInt(ob.lootPerUnit || '0', 10)
            if (isNaN(price) || price <= 0) return false
            if ((isNaN(shares) || shares <= 0) && (isNaN(loot) || loot <= 0)) return false
          }
          // Allowlist size check
          const obAllowlist = parseAllowlistInput(ob.allowlistAddresses || '')
          if (obAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) return false
          if (obAllowlist.invalid.length > 0) return false
        }
        if (data.enableERC20Tribute) {
          const erc = data.erc20TributeConfig
          if (!erc.tributeToken || !isAddress(erc.tributeToken)) {
            return false
          }
          const priceShare = parseFloat(erc.pricePerShare || '0')
          if (isNaN(priceShare) || priceShare <= 0) return false
          // Allowlist size check
          const ercAllowlist = parseAllowlistInput(erc.allowlistAddresses || '')
          if (ercAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) return false
          if (ercAllowlist.invalid.length > 0) return false
        }
        return true
      }
      case 4: {
        // Guild tokens — validate addresses for ERC-20 entries, skip native tokens
        const tokens = getValues().guildTokens
        if (tokens.length > MAX_GUILD_TOKENS) return false
        for (const t of tokens) {
          if (t.type === 'native') continue
          if (!t.address || !isAddress(t.address)) return false
        }
        return true
      }
      case 5:
        return trigger(['vaultOwners', 'vaultThreshold'])
      default:
        return true
    }
  }

  // Helpful, step-specific message shown when validateCurrentStep() fails.
  const getStepErrorMessage = (step: number): string => {
    switch (step) {
      case 0:
        return 'Fix the highlighted fields to continue.'
      case 1:
        return 'Check your member entries to continue.'
      case 2:
        return 'Fix the highlighted governance settings to continue.'
      case 3:
        return 'Fix the highlighted navigator settings to continue.'
      case 4:
        return 'Check your guild token configuration to continue.'
      case 5:
        return 'Fix the highlighted vault settings to continue.'
      default:
        return 'Please correct the errors above to continue.'
    }
  }

  const goNext = async () => {
    const isValid = await validateCurrentStep()
    if (!isValid) {
      setStepError(getStepErrorMessage(currentStep))
      return
    }
    setStepError(null)
    if (currentStep < STEPS.length - 1) {
      // Auto-populate vault owners from members when entering the vault step
      if (currentStep === 4) {
        const members = getValues().members.filter(m => m.address.trim())
        if (members.length > 0) {
          setValue('vaultOwners', members.map(m => ({ address: m.address.trim() })))
        }
      }
      setCurrentStep((prev) => prev + 1)
    }
  }

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleLaunch = async (
    salts: { vault: string; shares: string; loot: string; daoShip: string },
    navigators: string[],
    navigatorPermissions: bigint[],
  ): Promise<{ daoShip: string; vault: string }> => {
    const data = getValues()

    const votingPeriod = parseDurationToSeconds(data.votingPeriodInput) ?? 0
    const gracePeriod = parseDurationToSeconds(data.gracePeriodInput) ?? 0

    const result = await launch({
      salts,
      governanceConfig: {
        votingPeriod,
        gracePeriod,
        proposalOffering: parseTokenAmount(data.proposalOffering || '0'),
        quorumPercent: Math.round(parseFloat(data.quorumPercent || '0') * 100),
        sponsorThreshold: parseTokenAmount(data.sponsorThreshold || '1'),
        minRetentionPercent: Math.round(parseFloat(data.minRetentionPercent || '0') * 100),
        defaultExpiryWindow: parseDurationToSeconds(data.defaultExpiryWindow) ?? 0,
      },
      tokenConfig: {
        shareTokenName: data.shareTokenName || `${data.name} Shares`,
        shareTokenSymbol: data.shareTokenSymbol || 'SHARES',
        lootTokenName: data.lootTokenName || `${data.name} Loot`,
        lootTokenSymbol: data.lootTokenSymbol || 'LOOT',
        sharePaused: data.pauseSharesOnLaunch,
        lootPaused: data.pauseLootOnLaunch,
      },
      members: data.members
        .filter((m) => m.address.trim())
        .map((m) => ({
          address: m.address.trim(),
          shares: parseTokenAmount(m.shares || '0'),
          loot: parseTokenAmount(m.loot || '0'),
        })),
      guildTokens: data.guildTokens
        .map(t => t.type === 'native' ? NATIVE_TOKEN_SENTINEL : t.address.trim())
        .filter(Boolean),
      navigators,
      navigatorPermissions,
      vaultOwners: data.vaultOwners.map(o => o.address.trim()).filter(Boolean),
      vaultThreshold: parseInt(data.vaultThreshold || '1', 10),
    })
    setLaunchComplete(true)
    return result
  }

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card px-6 py-12 text-center">
          <h2 className="text-xl font-bold font-display text-dao-text mb-2">Connect Wallet</h2>
          <p className="text-dao-text-muted">
            You need to connect your wallet before launching a new DAO.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step.key} className="flex items-center flex-1">
            {/* Step circle */}
            <button
              type="button"
              onClick={() => {
                if (index < currentStep && !launchComplete) setCurrentStep(index)
              }}
              disabled={index > currentStep || launchComplete}
              className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all ${
                index < currentStep
                  ? 'bg-emerald-500 border-emerald-500 text-white cursor-pointer'
                  : index === currentStep
                    ? 'bg-accent-500 border-accent-500 text-white'
                    : 'bg-dao-dark-3 border-dao-border text-dao-text-hint'
              }`}
            >
              {index < currentStep ? (
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </button>

            {/* Step label */}
            <span
              className={`hidden sm:block ml-2 text-xs font-medium ${
                index <= currentStep ? 'text-dao-text-secondary' : 'text-dao-text-hint'
              }`}
            >
              {step.label}
            </span>

            {/* Connecting line */}
            {index < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 sm:mx-3 ${
                  index < currentStep ? 'bg-emerald-500' : 'bg-dao-border'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mobile-only active step label */}
      <p className="sm:hidden -mt-3 text-xs font-medium text-dao-text-secondary">
        Step {currentStep + 1} of {STEPS.length} &middot; {STEPS[currentStep].label}
      </p>

      {/* Resumed session notice */}
      {showResumed && savedState && !launchComplete && currentStep < STEPS.length - 1 && (
        <div className="bg-accent-100 dark:bg-accent-500/10 border border-accent-500/40 dark:border-accent-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-accent-900 dark:text-accent-300">
            Resumed from your previous session (step {savedState.step + 1}/{STEPS.length}).
          </p>
          <button
            type="button"
            onClick={() => {
              clearLaunchState()
              reset(DEFAULT_VALUES)
              setCurrentStep(0)
              setShowResumed(false)
            }}
            className="text-xs text-dao-text-muted hover:text-dao-text transition-colors ml-4 flex-shrink-0"
          >
            Start over
          </button>
        </div>
      )}

      {/* Step content */}
      <div className="card px-6 py-6">
        {currentStep === 0 && <BasicInfoStep control={control} errors={errors} />}
        {currentStep === 1 && <MembersStep control={control} errors={errors} />}
        {currentStep === 2 && <GovernanceStep control={control} errors={errors} />}
        {currentStep === 3 && <NavigatorsStep control={control} errors={errors} />}
        {currentStep === 4 && <GuildTokensStep control={control} errors={errors} />}
        {currentStep === 5 && <VaultStep control={control} errors={errors} />}
        {currentStep === 6 && <ReviewStep formData={getValues()} onSubmit={handleLaunch} />}
      </div>

      {/* Launch error */}
      {launchError && !launchComplete && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">
            {launchError.message || 'Failed to launch DAO'}
          </p>
        </div>
      )}

      {/* Step-level validation error */}
      {stepError && currentStep < STEPS.length - 1 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{stepError}</p>
        </div>
      )}

      {/* Navigation buttons */}
      {currentStep < STEPS.length - 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={goBack}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button
            variant="primary"
            onClick={goNext}
          >
            Next
          </Button>
        </div>
      )}

      {currentStep === STEPS.length - 1 && !launchComplete && (
        <div className="flex items-center justify-start">
          <Button
            variant="secondary"
            onClick={goBack}
            disabled={isLaunching}
          >
            Back
          </Button>
        </div>
      )}
    </div>
  )
}

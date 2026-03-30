import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useLaunch } from '@/hooks/useLaunch'
import { useWallet } from '@/hooks/useWallet'
import { parseTokenAmount } from '@/utils/format'
import { NATIVE_TOKEN_SENTINEL } from '@/config/contracts'
import { parseDurationToSeconds } from '@/utils/time'
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
  },
  enableERC20Tribute: false,
  erc20TributeConfig: {
    tributeToken: '',
    pricePerShare: '0',
    pricePerLoot: '0',
    expiry: '',
    mintCap: '0',
    perAddressCap: '0',
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

function loadFormState(): { values: LaunchFormValues; step: number } | null {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY)
    const stepRaw = localStorage.getItem(STEP_STORAGE_KEY)
    if (!raw) return null
    const values = JSON.parse(raw) as LaunchFormValues
    // Migrate guild tokens from old format (no type field) to new format
    if (values.guildTokens) {
      values.guildTokens = values.guildTokens.map(t => ({
        ...t,
        type: t.type || 'erc20',
      }))
    }
    return { values, step: stepRaw ? parseInt(stepRaw, 10) : 0 }
  } catch { return null }
}

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

  const [currentStep, setCurrentStep] = useState(() => savedState?.step ?? 0)
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
        }
        if (data.enableERC20Tribute) {
          const erc = data.erc20TributeConfig
          if (!erc.tributeToken || !/^0x[0-9a-fA-F]{40}$/.test(erc.tributeToken)) {
            return false
          }
          const priceShare = parseFloat(erc.pricePerShare || '0')
          if (isNaN(priceShare) || priceShare <= 0) return false
        }
        return true
      }
      case 4: {
        // Guild tokens — validate addresses for ERC-20 entries, skip native tokens
        const tokens = getValues().guildTokens
        for (const t of tokens) {
          if (t.type === 'native') continue
          if (!t.address || !/^0x[0-9a-fA-F]{40}$/.test(t.address)) return false
        }
        return true
      }
      case 5:
        return trigger(['vaultOwners', 'vaultThreshold'])
      default:
        return true
    }
  }

  const goNext = async () => {
    const isValid = await validateCurrentStep()
    if (isValid && currentStep < STEPS.length - 1) {
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
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all ${
                index < currentStep
                  ? 'bg-green-500 border-green-500 text-white cursor-pointer'
                  : index === currentStep
                    ? 'bg-accent-500 border-accent-500 text-white'
                    : 'bg-dao-dark-3 border-dao-border text-dao-text-hint'
              }`}
            >
              {index < currentStep ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                className={`flex-1 h-0.5 mx-3 ${
                  index < currentStep ? 'bg-green-500' : 'bg-dao-border'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Resumed session notice */}
      {savedState && !launchComplete && currentStep < STEPS.length - 1 && (
        <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-accent-300">
            Resumed from your previous session (step {savedState.step + 1}/{STEPS.length}).
          </p>
          <button
            type="button"
            onClick={() => {
              clearLaunchState()
              reset(DEFAULT_VALUES)
              setCurrentStep(0)
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

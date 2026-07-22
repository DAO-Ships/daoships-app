import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/common/Button'
import { useSaltMining } from '@/hooks/useSaltMining'
import { useLaunchCost, type LaunchCostEstimate } from '@/hooks/useLaunchCost'
import { formatDuration, parseDurationToSeconds } from '@/utils/time'
import { formatNumber, formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { NETWORK_CONFIG } from '@/config/contracts'
import { posterService } from '@/services/core/PosterService'
import { navigatorDeployService } from '@/services/core/NavigatorDeployService'
import { tokenService } from '@/services/core/TokenService'
import { hasCodeAt } from '@/services/utils/TxTracker'
import { parseAllowlistInput, buildAllowlistTree, downloadAllowlistBackup } from '@/utils/allowlist'
import { MAX_ALLOWLIST_ADDRESSES } from '@/components/common/AllowlistInput'
import type { LaunchFormValues } from './BasicInfoStep'
import type { SaltMiningResult } from '@/hooks/useSaltMining'

// ═══════════════════════════════════════════════════════════════════════════
// ReviewStep - Step 6: Summary, step-wise launch pipeline with persistence
// ═══════════════════════════════════════════════════════════════════════════

const MANAGER_PERMISSION = 2n

const PIPELINE_STORAGE_KEY = 'daoships-launch-pipeline'

interface ReviewStepProps {
  formData: LaunchFormValues
  onSubmit: (
    salts: { vault: string; shares: string; loot: string; daoShip: string },
    navigators: string[],
    navigatorPermissions: bigint[],
  ) => Promise<{ daoShip: string; vault: string }>
}

type PipelineStepStatus = 'pending' | 'active' | 'done' | 'failed'

interface PipelineStepState {
  id: string
  label: string
  status: PipelineStepStatus
  error?: string
}

interface PipelineState {
  started: boolean
  steps: PipelineStepState[]
  saltResults: SaltMiningResult | null
  onboarderAddress: string | null
  erc20TributeAddress: string | null
  launchResult: { daoShip: string; vault: string } | null
  profilePosted: boolean
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function explorerLink(addr: string): string {
  return `${NETWORK_CONFIG.blockExplorerUrl}/address/${addr}`
}

function buildPipelineSteps(formData: LaunchFormValues): PipelineStepState[] {
  const steps: PipelineStepState[] = [
    { id: 'mine', label: 'Mine CREATE2 salts', status: 'pending' },
  ]
  if (formData.enableOnboarder) {
    steps.push({ id: 'onboarder', label: 'Deploy Onboarder Navigator', status: 'pending' })
  }
  if (formData.enableERC20Tribute) {
    steps.push({ id: 'erc20tribute', label: 'Deploy ERC-20 Tribute Navigator', status: 'pending' })
  }
  steps.push(
    { id: 'launch', label: 'Launch DAO', status: 'pending' },
    { id: 'profile', label: 'Post DAO profile', status: 'pending' },
  )
  return steps
}

function getTransactionCount(formData: LaunchFormValues): number {
  let count = 1 // DAO launch tx
  if (formData.enableOnboarder) count++
  if (formData.enableERC20Tribute) count++
  // Profile post is a separate tx
  count++
  return count
}

function savePipelineState(state: PipelineState) {
  try {
    // bigint cannot be serialized, convert navigatorPermissions context isn't stored
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be full or unavailable
  }
}

function loadPipelineState(): PipelineState | null {
  try {
    const raw = localStorage.getItem(PIPELINE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PipelineState
  } catch {
    return null
  }
}

function clearPipelineState() {
  try {
    localStorage.removeItem(PIPELINE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function ReviewStep({ formData, onSubmit }: ReviewStepProps) {
  const navigate = useNavigate()
  const { mining, progress, mine, cancel } = useSaltMining()
  const cost = useLaunchCost(formData)

  // Check for a saved pipeline from a previous attempt
  const [savedPipeline] = useState<PipelineState | null>(() => loadPipelineState())
  const [showResume, setShowResume] = useState(() => {
    const saved = loadPipelineState()
    return saved?.started && !saved.steps.every(s => s.status === 'done')
  })

  const freshPipeline: PipelineState = {
    started: false,
    steps: buildPipelineSteps(formData),
    saltResults: null,
    onboarderAddress: null,
    erc20TributeAddress: null,
    launchResult: null,
    profilePosted: false,
  }

  const [pipeline, setPipeline] = useState<PipelineState>(freshPipeline)

  const pipelineRef = useRef(pipeline)

  // Unified state setter — ALWAYS updates both React state AND the ref
  // This is critical because the pipeline loop is async and React doesn't
  // re-render between steps, so the ref is the only way to share state
  // between steps within the same async execution.
  const updatePipeline = useCallback((updater: (prev: PipelineState) => PipelineState) => {
    setPipeline(prev => {
      const next = updater(prev)
      pipelineRef.current = next
      return next
    })
  }, [])

  // Persist pipeline state on change (for crash recovery)
  useEffect(() => {
    if (pipeline.started && !pipeline.steps.every(s => s.status === 'done')) {
      savePipelineState(pipeline)
    }
  }, [pipeline])

  // Warn before navigating away mid-pipeline. This is a 3-4 transaction sequence in
  // which a lost receipt previously stranded a deployed-but-unrecorded DAO.
  useEffect(() => {
    const inFlight = pipeline.started && !pipeline.steps.every(s => s.status === 'done')
    if (!inFlight) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Required by some browsers for the prompt to show.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pipeline])

  const updateStepStatus = useCallback((stepId: string, status: PipelineStepStatus, error?: string) => {
    updatePipeline(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === stepId ? { ...s, status, error: error || undefined } : s,
      ),
    }))
  }, [updatePipeline])

  // ── Pipeline execution ──────────────────────────────────────────────

  const runPipeline = useCallback(async (fromStepId?: string) => {
    const steps = pipelineRef.current.steps
    const startIndex = fromStepId ? steps.findIndex(s => s.id === fromStepId) : 0

    updatePipeline(prev => ({ ...prev, started: true }))

    // Local variables to pass data between steps within the same async call.
    // This avoids any React state timing issues — each step writes to these
    // and the next step reads from them (falling back to ref for retries).
    let localSaltResults = pipelineRef.current.saltResults
    let localOnboarderAddress = pipelineRef.current.onboarderAddress
    let localERC20TributeAddress = pipelineRef.current.erc20TributeAddress
    let localLaunchResult = pipelineRef.current.launchResult

    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i]

      // Skip already-done steps
      if (pipelineRef.current.steps[i]?.status === 'done') continue

      updateStepStatus(step.id, 'active')

      try {
        switch (step.id) {
          case 'mine': {
            const mineResult = await mine({
              vaultOwners: formData.vaultOwners.map(o => o.address).filter(Boolean),
              vaultThreshold: parseInt(formData.vaultThreshold || '1', 10),
            })
            if (!mineResult) throw new Error('Salt mining was cancelled')
            localSaltResults = mineResult
            updatePipeline(prev => ({ ...prev, saltResults: mineResult }))
            updateStepStatus(step.id, 'done')
            break
          }

          case 'onboarder': {
            const salts = localSaltResults || pipelineRef.current.saltResults
            if (!salts) throw new Error('Salt mining results not available')
            const ob = formData.onboarderConfig

            // Compute allowlist root if addresses were provided
            const obAllowlist = parseAllowlistInput(ob.allowlistAddresses || '')
            if (obAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) {
              throw new Error(`Onboarder allowlist exceeds ${MAX_ALLOWLIST_ADDRESSES} addresses`)
            }
            const obTree = buildAllowlistTree(obAllowlist.addresses)

            const address = await navigatorDeployService.deployOnboarderNavigator({
              daoShipAddress: salts.daoShip.address,
              mode: ob.mode,
              shareMultiplier: BigInt(ob.shareMultiplier || '0'),
              lootMultiplier: BigInt(ob.lootMultiplier || '0'),
              pricePerUnit: parseTokenAmount(ob.pricePerUnit || '0'),
              sharesPerUnit: parseTokenAmount(ob.sharesPerUnit || '0'),
              lootPerUnit: parseTokenAmount(ob.lootPerUnit || '0'),
              minTribute: parseTokenAmount(ob.minTribute || '0'),
              expiry: BigInt(ob.expiry || '0'),
              mintCap: parseTokenAmount(ob.mintCap || '0'),
              perAddressCap: parseTokenAmount(ob.perAddressCap || '0'),
              allowlistRoot: obTree?.root,
              name: ob.navigatorName || '',
              description: ob.navigatorDescription || '',
            })

            // Post allowlist data to Poster so proofs can be generated later
            if (obTree) {
              const treeDump = obTree.dump()
              try {
                await posterService.postNavigatorAllowlist({
                  daoAddress: salts.daoShip.address.toLowerCase(),
                  navigatorAddress: address.toLowerCase(),
                  root: obTree.root,
                  addresses: obAllowlist.addresses,
                  treeDump,
                })
              } catch (err) {
                console.error('[ReviewStep] Failed to post onboarder allowlist to Poster:', err)
                // Auto-download backup so the deployer can recover
                downloadAllowlistBackup(address, obTree.root, obAllowlist.addresses, treeDump)
              }
            }



            localOnboarderAddress = address
            updatePipeline(prev => ({ ...prev, onboarderAddress: address }))
            updateStepStatus(step.id, 'done')
            break
          }

          case 'erc20tribute': {
            const salts = localSaltResults || pipelineRef.current.saltResults
            if (!salts) throw new Error('Salt mining results not available')
            const erc = formData.erc20TributeConfig

            // Compute allowlist root if addresses were provided
            const ercAllowlist = parseAllowlistInput(erc.allowlistAddresses || '')
            if (ercAllowlist.addresses.length > MAX_ALLOWLIST_ADDRESSES) {
              throw new Error(`ERC20 Tribute allowlist exceeds ${MAX_ALLOWLIST_ADDRESSES} addresses`)
            }
            const ercTree = buildAllowlistTree(ercAllowlist.addresses)

            // pricePerShare/pricePerLoot are denominated in the TRIBUTE TOKEN (the
            // contract's own example is pricePerShare = 100e6 for 100 USDC), and they
            // are immutable constructor args — a wrong scale cannot be fixed without a
            // governance redeploy + re-sanction. Resolve the real decimals and refuse to
            // deploy if the token cannot be read. NavigatorCatalog already verified the
            // token on its path; this one did not, which is how the two drifted.
            const ercTokenMeta = await tokenService.verifyERC20(erc.tributeToken)
            if (!ercTokenMeta) {
              throw new Error(
                'No ERC-20 token found at the tribute token address on this network. '
                + 'Cannot determine decimals, and tribute prices are immutable once deployed.',
              )
            }
            const ercDecimals = ercTokenMeta.decimals

            const address = await navigatorDeployService.deployERC20TributeNavigator({
              daoShipAddress: salts.daoShip.address,
              tributeToken: erc.tributeToken,
              pricePerShare: parseTokenAmount(erc.pricePerShare || '0', ercDecimals),
              pricePerLoot: parseTokenAmount(erc.pricePerLoot || '0', ercDecimals),
              expiry: BigInt(erc.expiry || '0'),
              mintCap: parseTokenAmount(erc.mintCap || '0'),
              perAddressCap: parseTokenAmount(erc.perAddressCap || '0'),
              allowlistRoot: ercTree?.root,
              name: erc.navigatorName || '',
              description: erc.navigatorDescription || '',
            })

            // Post allowlist data to Poster so proofs can be generated later
            if (ercTree) {
              const treeDump = ercTree.dump()
              try {
                await posterService.postNavigatorAllowlist({
                  daoAddress: salts.daoShip.address.toLowerCase(),
                  navigatorAddress: address.toLowerCase(),
                  root: ercTree.root,
                  addresses: ercAllowlist.addresses,
                  treeDump,
                })
              } catch (err) {
                console.error('[ReviewStep] Failed to post ERC20 tribute allowlist to Poster:', err)
                downloadAllowlistBackup(address, ercTree.root, ercAllowlist.addresses, treeDump)
              }
            }


            localERC20TributeAddress = address
            updatePipeline(prev => ({ ...prev, erc20TributeAddress: address }))
            updateStepStatus(step.id, 'done')
            break
          }

          case 'launch': {
            const salts = localSaltResults || pipelineRef.current.saltResults
            if (!salts) throw new Error('Salt mining results not available')
            const navAddresses: string[] = []
            const navPermissions: bigint[] = []
            const onbAddr = localOnboarderAddress || pipelineRef.current.onboarderAddress
            if (onbAddr) {
              navAddresses.push(onbAddr)
              navPermissions.push(MANAGER_PERMISSION)
            }
            const ercAddr = localERC20TributeAddress || pipelineRef.current.erc20TributeAddress
            if (ercAddr) {
              navAddresses.push(ercAddr)
              navPermissions.push(MANAGER_PERMISSION)
            }
            // Before re-broadcasting, check whether an earlier attempt already landed.
            // The DAO address is deterministic (CREATE2), so bytecode at
            // salts.daoShip.address means the launch succeeded even if we lost the
            // receipt. Re-sending would reuse the SAME salts and revert on collision,
            // which is what forced users into "Start Fresh" and a second paid launch.
            const alreadyDeployed = await hasCodeAt(salts.daoShip.address)
            if (alreadyDeployed === true) {
              const recovered = { daoShip: salts.daoShip.address, vault: salts.vault.address }
              localLaunchResult = recovered
              updatePipeline(prev => ({ ...prev, launchResult: recovered }))
              updateStepStatus(step.id, 'done')
              break
            }
            if (alreadyDeployed === null) {
              // Could not determine — do NOT gamble a colliding re-send.
              throw new Error(
                'Could not verify whether the DAO was already deployed (RPC unreachable). '
                + 'Retry once your connection recovers — re-sending now would reuse the same '
                + 'CREATE2 salts and revert.',
              )
            }

            const result = await onSubmit(
              {
                vault: salts.vault.salt,
                shares: salts.shares.salt,
                loot: salts.loot.salt,
                daoShip: salts.daoShip.salt,
              },
              navAddresses,
              navPermissions,
            )
            localLaunchResult = result
            updatePipeline(prev => ({ ...prev, launchResult: result }))
            updateStepStatus(step.id, 'done')
            break
          }

          case 'profile': {
            const result = localLaunchResult || pipelineRef.current.launchResult
            if (!result) throw new Error('Launch result not available')
            const profileLinks = formData.links && Object.keys(formData.links).length > 0
              ? formData.links
              : undefined
            await posterService.postDaoProfileInitial({
              daoAddress: result.daoShip.toLowerCase(),
              name: formData.name,
              // `description` is required by POSTER_SCHEMAS[DAO_PROFILE_INITIAL];
              // '' and undefined both fail that check identically, so pass the raw
              // string rather than widening the service signature.
              description: formData.description,
              avatar: formData.avatarUrl || undefined,
              banner: formData.bannerUrl || undefined,
              theme: formData.theme && Object.keys(formData.theme).length > 0 ? formData.theme : undefined,
              links: profileLinks,
            })
            updatePipeline(prev => ({ ...prev, profilePosted: true }))
            updateStepStatus(step.id, 'done')
            break
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : `Step "${step.label}" failed`
        updateStepStatus(step.id, 'failed', message)
        return // Stop pipeline on failure; user can retry
      }
    }

    // Pipeline complete -- clear all persisted launch state (pipeline + form + step)
    clearPipelineState()
    try {
      localStorage.removeItem('daoships-launch-form')
      localStorage.removeItem('daoships-launch-step')
    } catch { /* ignore */ }
  }, [formData, mine, onSubmit, updateStepStatus, updatePipeline])

  const handleRetryStep = useCallback((stepId: string) => {
    runPipeline(stepId)
  }, [runPipeline])

  const handleStartLaunch = useCallback(() => {
    runPipeline()
  }, [runPipeline])

  // ── Computed values for display ─────────────────────────────────────

  const votingSecs = parseDurationToSeconds(formData.votingPeriodInput || '0') ?? 0
  const graceSecs = parseDurationToSeconds(formData.gracePeriodInput || '0') ?? 0
  const expirySecs = parseDurationToSeconds(formData.defaultExpiryWindow || '0') ?? 0
  const txCount = getTransactionCount(formData)
  const isRunning = pipeline.steps.some(s => s.status === 'active')
  const nativeSymbol = NETWORK_CONFIG.nativeCurrency.symbol
  const allDone = pipeline.steps.every(s => s.status === 'done')

  // ── Post-Launch Completion View ──────────────────────────────────────
  if (allDone && pipeline.launchResult) {
    return (
      <div className="space-y-6">
        {/* Success Banner */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-6 py-4">
          <h2 className="text-lg font-bold font-display text-emerald-400 mb-1">Your DAO is underway</h2>
          <p className="text-sm text-dao-text-muted">
            Your DAO contracts have been deployed to the network.
            {pipeline.onboarderAddress && ' Onboarder navigator is active.'}
            {pipeline.erc20TributeAddress && ' ERC-20 tribute navigator is active.'}
          </p>
        </div>

        {/* Deployed Addresses */}
        <div className="card">
          <div className="px-6 py-3 border-b border-dao-border">
            <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
              Deployed Contracts
            </h3>
          </div>
          <div className="px-6 py-4 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-dao-text-hint">DAO (DAOShip)</span>
              <a
                href={explorerLink(pipeline.launchResult.daoShip)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-accent-400 hover:text-accent-300 transition-colors"
              >
                {truncateAddress(pipeline.launchResult.daoShip)}
              </a>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-dao-text-hint">Treasury (Vault)</span>
              <a
                href={explorerLink(pipeline.launchResult.vault)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-accent-400 hover:text-accent-300 transition-colors"
              >
                {truncateAddress(pipeline.launchResult.vault)}
              </a>
            </div>
            {pipeline.onboarderAddress && (
              <div className="flex justify-between items-center">
                <span className="text-dao-text-hint">Onboarder Navigator</span>
                <a
                  href={explorerLink(pipeline.onboarderAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-accent-400 hover:text-accent-300 transition-colors"
                >
                  {truncateAddress(pipeline.onboarderAddress)}
                </a>
              </div>
            )}
            {pipeline.erc20TributeAddress && (
              <div className="flex justify-between items-center">
                <span className="text-dao-text-hint">ERC-20 Tribute Navigator</span>
                <a
                  href={explorerLink(pipeline.erc20TributeAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-accent-400 hover:text-accent-300 transition-colors"
                >
                  {truncateAddress(pipeline.erc20TributeAddress)}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Steps Summary */}
        <div className="card">
          <div className="px-6 py-3 border-b border-dao-border">
            <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
              Completed Steps
            </h3>
          </div>
          <div className="px-6 py-4 space-y-2">
            {pipeline.steps.map(step => (
              <StepIndicator key={step.id} label={step.label} status={step.status} />
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(`/dao/${pipeline.launchResult!.daoShip.toLowerCase()}`)}
          >
            View DAO
          </Button>
        </div>
      </div>
    )
  }

  // ── Active Pipeline View (launch in progress) ────────────────────────
  if (pipeline.started) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold font-display text-dao-text mb-1">Launching DAO</h2>
          <p className="text-sm text-dao-text-muted">
            Your DAO is being deployed. Please confirm each transaction in your wallet when prompted.
          </p>
        </div>

        {/* Pipeline Steps */}
        <div className="card px-6 py-5 space-y-3">
          {pipeline.steps.map(step => (
            <div key={step.id}>
              <StepIndicator label={step.label} status={step.status} />
              {step.status === 'failed' && step.error && (
                <div className="ml-7 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-red-400 mb-2">{step.error}</p>
                  <button
                    type="button"
                    onClick={() => handleRetryStep(step.id)}
                    className="text-xs font-medium text-accent-400 hover:text-accent-300 transition-colors"
                  >
                    Retry this step
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Salt Mining Progress */}
        {mining && progress && (
          <div className="card px-6 py-4">
            <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
              Mining CREATE2 Salts
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dao-text-secondary">
                  {progress.currentContract} ({progress.contractsComplete}/{progress.totalContracts})
                </span>
                <span className="text-dao-text-hint">
                  Attempt #{progress.currentAttempt.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-dao-dark-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500 transition-all duration-300"
                  style={{
                    width: `${(progress.contractsComplete / progress.totalContracts) * 100}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={cancel}
                className="text-xs text-dao-text-hint hover:text-red-400 transition-colors"
              >
                Cancel Mining
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Resume Previous Attempt Prompt ─────────────────────────────────
  if (showResume && savedPipeline) {
    const completedSteps = savedPipeline.steps.filter(s => s.status === 'done')
    const failedStep = savedPipeline.steps.find(s => s.status === 'failed')

    return (
      <div className="space-y-6">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-6 py-4">
          <h2 className="text-lg font-bold font-display text-amber-400 mb-2">Previous Launch In Progress</h2>
          <p className="text-sm text-dao-text-muted mb-3">
            A previous launch attempt was interrupted. Some steps may have already completed and spent gas.
          </p>

          <div className="space-y-2 mb-4">
            {savedPipeline.steps.map(step => (
              <StepIndicator key={step.id} label={step.label} status={step.status} />
            ))}
          </div>

          {savedPipeline.onboarderAddress && (
            <p className="text-xs text-dao-text-hint mb-2">
              Onboarder Navigator deployed at: <span className="font-mono text-dao-text-muted">{truncateAddress(savedPipeline.onboarderAddress)}</span>
            </p>
          )}
          {savedPipeline.erc20TributeAddress && (
            <p className="text-xs text-dao-text-hint mb-2">
              ERC-20 Tribute Navigator deployed at: <span className="font-mono text-dao-text-muted">{truncateAddress(savedPipeline.erc20TributeAddress)}</span>
            </p>
          )}
          {failedStep && (
            <p className="text-xs text-red-400 mb-2">
              Failed at: {failedStep.label} — {failedStep.error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              updatePipeline(() => savedPipeline)
              setShowResume(false)
              // Resume from the first non-done step
              const resumeStep = savedPipeline.steps.find(s => s.status !== 'done')
              if (resumeStep) {
                runPipeline(resumeStep.id)
              }
            }}
          >
            Resume ({completedSteps.length}/{savedPipeline.steps.length} steps done)
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearPipelineState()
              updatePipeline(() => freshPipeline)
              setShowResume(false)
            }}
          >
            Start Fresh
          </Button>
        </div>

        <p className="text-xs text-dao-text-hint">
          Starting fresh will mine new salts and deploy new navigator contracts. Previously deployed navigators from the interrupted attempt will be orphaned (they point at an address that was never created).
        </p>
      </div>
    )
  }

  // ── Pre-Launch Review View ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-dao-text mb-1">Review & Launch</h2>
        <p className="text-sm text-dao-text-muted">
          Review your DAO configuration before deploying to the network.
        </p>
      </div>

      {/* Transaction count banner */}
      <div className="bg-accent-100 dark:bg-accent-500/10 border border-accent-500/40 dark:border-accent-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-accent-900 dark:text-accent-300">
          This launch requires <span className="font-semibold">{txCount} transactions</span>:
          salt mining (off-chain)
          {formData.enableOnboarder && ', deploy Onboarder Navigator'}
          {formData.enableERC20Tribute && ', deploy ERC-20 Tribute Navigator'}
          , deploy DAO, and post profile.
        </p>
      </div>

      {/* Estimated gas cost + balance check */}
      <LaunchCostCard cost={cost} />

      {/* Basic Info Summary */}
      <div className="card">
        <div className="px-6 py-3 border-b border-dao-border">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Basic Info
          </h3>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Name</span>
            <span className="text-dao-text font-medium">{formData.name || '-'}</span>
          </div>
          {formData.description && (
            <div className="flex justify-between gap-4">
              <span className="text-dao-text-hint flex-shrink-0">Description</span>
              <span className="text-dao-text-secondary text-right truncate">{formData.description}</span>
            </div>
          )}
          {formData.avatarUrl && (
            <div className="flex justify-between gap-4">
              <span className="text-dao-text-hint flex-shrink-0">Avatar</span>
              <span className="text-dao-text-secondary text-right truncate" title={formData.avatarUrl}>
                {formData.avatarUrl}
              </span>
            </div>
          )}
          {formData.links && Object.keys(formData.links).length > 0 && (
            <div className="pt-1">
              <span className="text-dao-text-hint text-xs uppercase tracking-wider">Links</span>
              <div className="mt-1 space-y-1">
                {Object.entries(formData.links).filter(([, v]) => v).map(([key, url]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <span className="text-dao-text-hint capitalize">{key}</span>
                    <span className="text-dao-text-secondary text-right truncate" title={url}>
                      {url}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Share Token</span>
            <span className="text-dao-text-secondary">
              {formData.shareTokenName || 'Default'} ({formData.shareTokenSymbol || '-'})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Loot Token</span>
            <span className="text-dao-text-secondary">
              {formData.lootTokenName || 'Default'} ({formData.lootTokenSymbol || '-'})
            </span>
          </div>
          {formData.pauseSharesOnLaunch && (
            <div className="flex justify-between">
              <span className="text-dao-text-hint">Share Transfers</span>
              <span className="text-amber-400">Paused</span>
            </div>
          )}
          {formData.pauseLootOnLaunch && (
            <div className="flex justify-between">
              <span className="text-dao-text-hint">Loot Transfers</span>
              <span className="text-amber-400">Paused</span>
            </div>
          )}
        </div>
      </div>

      {/* Members Summary */}
      <div className="card">
        <div className="px-6 py-3 border-b border-dao-border">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Members ({formData.members.length})
          </h3>
        </div>
        <div className="px-6 py-4 space-y-1 text-sm">
          {formData.members.map((member, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="font-mono text-dao-text-secondary truncate" title={member.address}>
                {member.address ? truncateAddress(member.address) : 'No address'}
              </span>
              <span className="text-dao-text-hint flex-shrink-0 ml-2">
                {member.shares} shares, {member.loot} loot
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Governance Summary */}
      <div className="card">
        <div className="px-6 py-3 border-b border-dao-border">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Governance
          </h3>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Voting Period</span>
            <span className="text-dao-text-secondary">{votingSecs > 0 ? formatDuration(votingSecs) : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Grace Period</span>
            <span className="text-dao-text-secondary">{graceSecs > 0 ? formatDuration(graceSecs) : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Quorum</span>
            <span className="text-dao-text-secondary">{formData.quorumPercent || '0'}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Proposal Offering</span>
            <span className="text-dao-text-secondary">{formData.proposalOffering || '0'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Sponsor Threshold</span>
            <span className="text-dao-text-secondary">{formData.sponsorThreshold || '1'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Min Retention</span>
            <span className="text-dao-text-secondary">{formData.minRetentionPercent || '0'}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dao-text-hint">Default Expiry Window</span>
            <span className="text-dao-text-secondary">
              {expirySecs > 0 ? formatDuration(expirySecs) : '2x(voting+grace) fallback'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigators Summary */}
      <div className="card">
        <div className="px-6 py-3 border-b border-dao-border">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Navigators
          </h3>
        </div>
        <div className="px-6 py-4 space-y-3 text-sm">
          {!formData.enableOnboarder && !formData.enableERC20Tribute && (
            <p className="text-dao-text-hint">
              No navigators enabled. You can add them later via governance proposals.
            </p>
          )}

          {formData.enableOnboarder && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0" />
                <span className="text-dao-text font-medium">Onboarder Navigator</span>
              </div>
              <div className="ml-4 space-y-1 text-dao-text-muted">
                <div className="flex justify-between">
                  <span>Mode</span>
                  <span className="text-dao-text-secondary capitalize">{formData.onboarderConfig.mode === 'fixedPrice' ? 'Fixed Price' : 'Multiplier'}</span>
                </div>
                {formData.onboarderConfig.mode === 'multiplier' ? (
                  <>
                    <div className="flex justify-between">
                      <span>Share Multiplier</span>
                      <span className="text-dao-text-secondary">{formData.onboarderConfig.shareMultiplier} bps</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Loot Multiplier</span>
                      <span className="text-dao-text-secondary">{formData.onboarderConfig.lootMultiplier} bps</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Price Per Unit</span>
                      <span className="text-dao-text-secondary">{formData.onboarderConfig.pricePerUnit} QUAI</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shares Per Unit</span>
                      <span className="text-dao-text-secondary">{formData.onboarderConfig.sharesPerUnit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Loot Per Unit</span>
                      <span className="text-dao-text-secondary">{formData.onboarderConfig.lootPerUnit}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span>Min Tribute</span>
                  <span className="text-dao-text-secondary">{formData.onboarderConfig.minTribute} QUAI</span>
                </div>
                {formData.onboarderConfig.mintCap !== '0' && (
                  <div className="flex justify-between">
                    <span>Mint Cap</span>
                    <span className="text-dao-text-secondary">{formData.onboarderConfig.mintCap}</span>
                  </div>
                )}
                {formData.onboarderConfig.perAddressCap !== '0' && (
                  <div className="flex justify-between">
                    <span>Per-Address Cap</span>
                    <span className="text-dao-text-secondary">{formData.onboarderConfig.perAddressCap}</span>
                  </div>
                )}
                {formData.onboarderConfig.expiry && (
                  <div className="flex justify-between">
                    <span>Expiry</span>
                    <span className="text-dao-text-secondary">{formData.onboarderConfig.expiry}s</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {formData.enableERC20Tribute && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0" />
                <span className="text-dao-text font-medium">ERC-20 Tribute Navigator</span>
              </div>
              <div className="ml-4 space-y-1 text-dao-text-muted">
                <div className="flex justify-between gap-4">
                  <span>Tribute Token</span>
                  <span className="text-dao-text-secondary font-mono truncate" title={formData.erc20TributeConfig.tributeToken}>
                    {truncateAddress(formData.erc20TributeConfig.tributeToken)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Price Per Share</span>
                  <span className="text-dao-text-secondary">{formData.erc20TributeConfig.pricePerShare}</span>
                </div>
                <div className="flex justify-between">
                  <span>Price Per Loot</span>
                  <span className="text-dao-text-secondary">{formData.erc20TributeConfig.pricePerLoot}</span>
                </div>
                {formData.erc20TributeConfig.mintCap !== '0' && (
                  <div className="flex justify-between">
                    <span>Mint Cap</span>
                    <span className="text-dao-text-secondary">{formData.erc20TributeConfig.mintCap}</span>
                  </div>
                )}
                {formData.erc20TributeConfig.perAddressCap !== '0' && (
                  <div className="flex justify-between">
                    <span>Per-Address Cap</span>
                    <span className="text-dao-text-secondary">{formData.erc20TributeConfig.perAddressCap}</span>
                  </div>
                )}
                {formData.erc20TributeConfig.expiry && (
                  <div className="flex justify-between">
                    <span>Expiry</span>
                    <span className="text-dao-text-secondary">{formData.erc20TributeConfig.expiry}s</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Guild Tokens Summary */}
      <div className="card">
        <div className="px-6 py-3 border-b border-dao-border">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Guild Tokens
          </h3>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          {formData.guildTokens.filter(t => t.type === 'native' || t.address.trim()).length === 0 ? (
            <p className="text-dao-text-hint">
              No guild tokens configured. Members will not be able to ragequit for treasury tokens until tokens are added via governance.
            </p>
          ) : (
            formData.guildTokens.filter(t => t.type === 'native' || t.address.trim()).map((token, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-dao-text-hint">Token {i + 1}</span>
                {token.type === 'native' ? (
                  <span className="text-dao-text-secondary">
                    {NETWORK_CONFIG.nativeCurrency.name} ({NETWORK_CONFIG.nativeCurrency.symbol})
                    <span className="text-xs text-dao-text-hint ml-2">Network Token</span>
                  </span>
                ) : (
                  <span className="font-mono text-dao-text-secondary" title={token.address}>
                    {truncateAddress(token.address)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Vault Summary */}
      <div className="card">
        <div className="px-6 py-3 border-b border-dao-border">
          <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
            Vault
          </h3>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          {formData.vaultOwners.filter(o => o.address.trim()).map((owner, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-dao-text-hint">Owner {i + 1}</span>
              <span className="font-mono text-dao-text-secondary" title={owner.address}>
                {truncateAddress(owner.address)}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-1 border-t border-dao-border">
            <span className="text-dao-text-hint">Threshold</span>
            <span className="text-dao-text-secondary">
              {formData.vaultThreshold} of {formData.vaultOwners.filter(o => o.address.trim()).length}
            </span>
          </div>
        </div>
      </div>

      {/* Pipeline Preview */}
      <div className="card px-6 py-4">
        <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider mb-3">
          Launch Pipeline
        </h3>
        <div className="space-y-2">
          {pipeline.steps.map(step => (
            <StepIndicator key={step.id} label={step.label} status={step.status} />
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex flex-col items-end gap-2">
        {cost.costUnknown ? (
          <p className="text-sm text-dao-text-hint text-right">
            Checking gas price and your balance…
          </p>
        ) : cost.insufficient && (
          <p className="text-sm text-red-400 text-right">
            Add at least {formatTokenAmount(cost.shortfall, 18, 3, 2)} {nativeSymbol} to your wallet to launch.
          </p>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={handleStartLaunch}
          disabled={isRunning || cost.insufficient}
        >
          Launch DAO
        </Button>
      </div>
    </div>
  )
}

// ── Helper Components ────────────────────────────────────────────────────

/**
 * Estimated gas cost of the whole launch, priced at the live gas price, with
 * the connected wallet's balance checked against it. The per-step figures are
 * modeled (the transactions can't be simulated before the salts are mined);
 * the services re-check each transaction exactly before it is signed.
 */
function LaunchCostCard({ cost }: { cost: LaunchCostEstimate }) {
  const symbol = NETWORK_CONFIG.nativeCurrency.symbol
  const fmt = (v: bigint | null) => (v == null ? '—' : `${formatTokenAmount(v, 18, 3, 2)} ${symbol}`)

  return (
    <div className="card">
      <div className="px-6 py-3 border-b border-dao-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dao-text-muted uppercase tracking-wider">
          Estimated Gas Cost
        </h3>
        {cost.gasPrice != null && (
          <span className="text-xs text-dao-text-hint">
            @ {formatNumber(Math.round(Number(cost.gasPrice) / 1e9))} gwei
          </span>
        )}
      </div>
      <div className="px-6 py-4 space-y-2 text-sm">
        {cost.lines.map(line => (
          <div key={line.id} className="flex justify-between gap-4">
            <span className="text-dao-text-hint">{line.label}</span>
            <span className="text-dao-text-secondary flex-shrink-0">
              <span className="text-dao-text-hint mr-2">{(Number(line.gas) / 1e6).toFixed(2)}M gas</span>
              {fmt(line.cost)}
            </span>
          </div>
        ))}

        <div className="flex justify-between pt-2 border-t border-dao-border">
          <span className="text-dao-text font-medium">Estimated total</span>
          <span className="text-dao-text font-medium">{fmt(cost.totalCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dao-text-hint">Recommended balance (incl. headroom)</span>
          <span className="text-dao-text-secondary">{fmt(cost.requiredBalance)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dao-text-hint">Your balance</span>
          <span className={cost.insufficient ? 'text-red-400 font-medium' : 'text-dao-text-secondary'}>
            {fmt(cost.balance)}
          </span>
        </div>

        {cost.gasPrice == null && (
          <p className="text-xs text-dao-text-hint pt-1">
            Could not read the current gas price, so this launch cannot be priced up front.
            Your wallet will show the cost of each transaction before you sign it.
          </p>
        )}
        {cost.insufficient && !cost.costUnknown && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mt-2">
            <p className="text-xs text-red-400">
              Your wallet is short about {formatTokenAmount(cost.shortfall, 18, 3, 2)} {symbol}.
              Launching now would deploy part of your DAO and then fail, leaving orphaned
              contracts behind — so the launch is blocked until you top up.
            </p>
          </div>
        )}
        {cost.low && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 mt-2">
            <p className="text-xs text-amber-400">
              This is close to your full balance. Gas prices can move between now and signing —
              consider topping up before launching.
            </p>
          </div>
        )}
        <p className="text-xs text-dao-text-hint pt-1">
          Estimates are based on a measured mainnet launch and the current gas price; actual cost varies.
        </p>
      </div>
    </div>
  )
}

function StepIndicator({ label, status }: { label: string; status: PipelineStepStatus }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {status === 'done' && (
        <svg aria-hidden="true" className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === 'active' && (
        <svg aria-hidden="true" className="w-4 h-4 text-accent-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {status === 'failed' && (
        <svg aria-hidden="true" className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {status === 'pending' && (
        <div className="w-4 h-4 rounded-full border-2 border-dao-border flex-shrink-0" />
      )}
      <span className={
        status === 'done' ? 'text-emerald-400'
          : status === 'active' ? 'text-dao-text'
            : status === 'failed' ? 'text-red-400'
              : 'text-dao-text-hint'
      }>
        {label}
      </span>
    </div>
  )
}

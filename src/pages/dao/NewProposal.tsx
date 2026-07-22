import { useState, useRef, useEffect } from 'react'
import { useOutletContext, useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { quais } from 'quais'
import { ZERO_ADDRESS } from '@/config/contracts'
import type { Dao } from '@/types'
import { ProposalType } from '@/types/proposal'
import { extractDaoConfig } from '@/types/dao'
import { useWallet } from '@/hooks/useWallet'
import { useTreasury } from '@/hooks/useTreasury'
import { useTreasuryBalances } from '@/hooks/useTreasuryBalances'
import { useMember } from '@/hooks/useMember'
import { useDaoProfile } from '@/hooks/useDaoProfile'
import { safeJsonParse, safeString, safeEntries } from '@/utils/contentJson'
import { extractTheme, type DaoTheme } from '@/utils/daoTheme'
import { buildProfileUpdate } from '@/utils/profileUpdate'
import { safeBigInt } from '@/utils/bigint'
import { formatTokenAmount } from '@/utils/format'
import { parseDurationToSeconds } from '@/utils/time'
import { ConnectWallet } from '@/components/common/ConnectWallet'
import { Card } from '@/components/common/Card'
import { Loading } from '@/components/common/Loading'
import { daoService } from '@/services/DaoService'
import { ProposalEncoder } from '@/services/utils/ProposalEncoder'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FundingForm, type VaultTokenOption } from '@/components/proposal/forms/FundingForm'
import { MembershipForm } from '@/components/proposal/forms/MembershipForm'
import { GuildTokensForm } from '@/components/proposal/forms/GuildTokensForm'
import { GovernanceForm } from '@/components/proposal/forms/GovernanceForm'
import { CustomActionForm } from '@/components/proposal/forms/CustomActionForm'
import { ProfileForm } from '@/components/proposal/forms/ProfileForm'
import { AnnouncementForm } from '@/components/proposal/forms/AnnouncementForm'
import { NavigatorForm } from '@/components/proposal/forms/NavigatorForm'
import { NavigatorSanctionForm } from '@/components/proposal/forms/NavigatorSanctionForm'
import { useNavigators } from '@/hooks/useNavigators'
import { CONTRACT_ADDRESSES } from '@/config/contracts'
import { POSTER_TAGS } from '@/types/poster'
import { posterService } from '@/services/core/PosterService'
import { NavigatorPermission } from '@/types/navigator'
import { isAddress } from '@/services/utils/AddressUtils'

/** The permission values the manual dropdown can produce (NavigatorForm PERMISSION_OPTIONS). */
const VALID_NAVIGATOR_PERMISSIONS = new Set<number>([
  NavigatorPermission.None,
  NavigatorPermission.ManagerOnly,
  NavigatorPermission.GovernorOnly,
  NavigatorPermission.AdminOnly,
  NavigatorPermission.ManagerAndGovernor,
  NavigatorPermission.AdminAndManager,
  NavigatorPermission.AdminAndGovernor,
  NavigatorPermission.All,
])
import { navigatorService } from '@/services/core/NavigatorService'
import { buildQueueChangeAction } from '@/utils/timelockProposals'

// ═══════════════════════════════════════════════════════════════════════════
// NewProposal - Proposal type picker and form
// ═══════════════════════════════════════════════════════════════════════════

interface DaoContext {
  dao: Dao
}

interface ProposalTypeOption {
  type: ProposalType
  label: string
  description: string
  icon: string
  category: string
}

const PROPOSAL_TYPES: ProposalTypeOption[] = [
  {
    type: ProposalType.Funding,
    label: 'Funding',
    description: 'Request tokens from the DAO treasury.',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    category: 'Treasury',
  },
  {
    type: ProposalType.GuildTokens,
    label: 'Guild Tokens',
    description: 'Add or remove ragequit-eligible tokens.',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    category: 'Treasury',
  },
  {
    type: ProposalType.Membership,
    label: 'Membership',
    description: 'Issue or burn shares/loot for members.',
    icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    category: 'Members',
  },
  {
    type: ProposalType.GovConfig,
    label: 'Governance Config',
    description: 'Modify voting period, quorum, thresholds.',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    category: 'Governance',
  },
  {
    type: ProposalType.Navigator,
    label: 'Navigators',
    description: 'Add, disable, or update navigator permissions.',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    category: 'Governance',
  },
  // NavigatorSanction is intentionally NOT in the picker — sanctioning/unsanctioning a read-only
  // navigator is initiated from the navigator's own page (per-navigator, directional), which
  // deep-links here with the target pre-configured. See NavigatorActivationPrompt / NavigatorDetail.
  {
    type: ProposalType.Profile,
    label: 'Update Profile',
    description: 'Update DAO name, avatar, links, or tags.',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    category: 'Communication',
  },
  {
    type: ProposalType.Announcement,
    label: 'Announcement',
    description: 'Post an official DAO announcement.',
    icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
    category: 'Communication',
  },
  {
    type: ProposalType.Custom,
    label: 'Custom Action',
    description: 'Execute arbitrary contract calls through the DAO.',
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    category: 'Advanced',
  },
]

const PROPOSAL_CATEGORIES = ['Treasury', 'Members', 'Governance', 'Communication', 'Advanced']

export function NewProposal() {
  const { daoId } = useParams()
  const { dao } = useOutletContext<DaoContext>()
  usePageTitle('New Proposal', dao.name)
  const { connected, address } = useWallet()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()

  // Pre-select proposal type and pre-fill data from query params (e.g. from NavigatorCatalog)
  const preselectedType = searchParams.get('type') as ProposalType | null
  const [selectedType, setSelectedType] = useState<ProposalType | null>(
    preselectedType && Object.values(ProposalType).includes(preselectedType) ? preselectedType : null,
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedProposalId, setSubmittedProposalId] = useState<number | null>(null)

  // Navigator pre-fill from query params
  // Deep-link prefills are attacker-supplyable, so they get the same validation the
  // manual path applies (NavigatorForm.tsx:108-112) — previously `addAddress` was taken
  // raw and `addPermission` was a bare Number(), accepting NaN, negatives and
  // out-of-enum values that the dropdown cannot produce.
  const prefillNavigator = (() => {
    const address = searchParams.get('addAddress')
    const rawPermission = searchParams.get('addPermission')
    if (!address || rawPermission === null) return null
    if (!isAddress(address)) return null
    const permission = Number(rawPermission)
    if (!Number.isInteger(permission) || !VALID_NAVIGATOR_PERMISSIONS.has(permission)) return null
    return { address, permission }
  })()
  const prefillNavigatorName = searchParams.get('addName') || undefined

  // Sanction prefill (from the navigator page's sanction/unsanction CTA, or NavigatorCatalog
  // after deploying a read-only navigator). `sanctionMode=remove` pre-configures unsanctioning.
  const prefillSanctionAddress = searchParams.get('sanctionAddress') || undefined
  const prefillSanctionMode = searchParams.get('sanctionMode') === 'remove' ? 'remove' : 'add'

  // Custom-action prefill (e.g. from BudgetPlugin: enable module / create / cancel budget).
  // A single pre-encoded action targeting a navigator or the vault.
  const customTo = searchParams.get('customTo')
  const prefillCustomActions = (() => {
    if (!customTo) return undefined
    // Reject the whole prefill on a malformed target rather than seeding a form with it.
    if (!isAddress(customTo)) return undefined
    const data = searchParams.get('customData') || '0x'
    if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) return undefined
    return [{
      to: customTo,
      // buildCustomActionHref hardcodes '0' with the comment "governance calls never
      // send native value". Honour the producer's own contract instead of trusting the
      // URL — otherwise any link could attach native value to a governance action.
      value: '0',
      data,
      // `customSummary` was an attacker-chosen label rendered as the action's
      // description. Dropped: ProposalActionSummary decodes the calldata itself and
      // shows the real target/value/selector.
      summary: undefined,
    }]
  })()
  const prefillCustomTitle = searchParams.get('customTitle') || undefined
  const prefillCustomDescription = searchParams.get('customDescription') || undefined

  const { data: treasury } = useTreasury(daoId)
  const { data: balances } = useTreasuryBalances(dao.avatar, treasury)
  const { data: member, isLoading: memberLoading } = useMember(daoId, address ?? undefined)
  const isMember = member ? (safeBigInt(member.shares) > 0n || safeBigInt(member.loot) > 0n) : false
  const { data: profileRecord } = useDaoProfile(daoId)
  const {
    data: navigators,
    isLoading: navigatorsLoading,
    isError: navigatorsError,
  } = useNavigators(daoId)

  // An active, sanctioned TimelockNavigator that holds GOVERNOR — when present, ALL
  // governance-config changes from the standard form route through its queueChange (no bypass).
  const activeTimelockNav = (navigators ?? []).find(
    (n) => n.navigator_type === 'TimelockNavigator'
      && n.is_active
      && (n.permission & 4) !== 0
      && n.trust_status === 'sanctioned',
  )
  const { data: timelockCfg } = useQuery({
    queryKey: ['timelockDelay', activeTimelockNav?.navigator_address],
    queryFn: () => navigatorService.getTimelockConfig(activeTimelockNav!.navigator_address),
    enabled: !!activeTimelockNav,
    staleTime: 60_000,
  })
  const activeTimelock = activeTimelockNav
    ? {
        address: activeTimelockNav.navigator_address,
        delaySeconds: timelockCfg ? Number(timelockCfg.delay) : 0,
        executionWindowSeconds: timelockCfg ? Number(timelockCfg.expiryWindow) : 0,
      }
    : null

  // Read sponsorship eligibility directly from the contract so the UI matches
  // what the service layer and contract will actually enforce. The indexer's
  // voting_power can lag behind on-chain state after delegation changes.
  const { data: onChainSponsor } = useQuery({
    queryKey: ['sponsorCheck', daoId, address],
    queryFn: async () => {
      const [votingPower, params] = await Promise.all([
        daoService.getCurrentVotes(daoId!, address!),
        daoService.getSponsorParams(daoId!),
      ])
      return { votingPower, ...params }
    },
    enabled: !!daoId && !!address,
    staleTime: 10_000,
  })

  const minOffering = onChainSponsor?.proposalOffering ?? safeBigInt(dao.proposal_offering)
  const minOfferingDisplay = minOffering > 0n ? formatTokenAmount(minOffering) : '0'
  const canSelfSponsor = onChainSponsor
    ? onChainSponsor.votingPower >= onChainSponsor.sponsorThreshold
    : (member ? safeBigInt(member.voting_power) >= safeBigInt(dao.sponsor_threshold) : false)

  const submitMutation = useMutation({
    mutationFn: async (params: {
      proposalData: string
      details: string
      expiration: number
      title: string
    }) => {
      // The service layer reads the exact offering from the contract and
      // determines self-sponsorship, so we don't need to validate here.
      const proposalId = await daoService.submitProposal(
        daoId!,
        params.proposalData,
        params.expiration,
        params.details,
      )

      return proposalId
    },
    onSuccess: (proposalId) => {
      queryClient.invalidateQueries({ queryKey: ['proposals', daoId] })
      // Don't navigate immediately — the indexer lags the tx by a second or two.
      // Show the submitted state and let the poll-until-ready effect redirect once
      // the proposal is actually fetchable, so the detail page never flashes "not found".
      setSubmittedProposalId(Number(proposalId))
    },
    onError: (err) => {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit proposal')
    },
  })

  const isSubmitting = submitMutation.isPending

  // Poll-until-ready redirect: after a successful submit, wait for the proposal to
  // become fetchable (indexer ingest, or on-chain fallback), priming the same query
  // cache the detail page reads so it renders instantly. Navigates anyway after a max
  // wait so the user is never stuck on the confirmation screen.
  useEffect(() => {
    if (submittedProposalId === null || !daoId) return
    const pid = String(submittedProposalId)
    const compositeId = `${daoId}-${pid}`
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const MAX_ATTEMPTS = 10
    const INTERVAL_MS = 1500

    const go = () => {
      if (!cancelled) navigate(`/dao/${daoId}/proposals/${pid}`)
    }

    const tick = async () => {
      if (cancelled) return
      attempts++
      let found = false
      try {
        const proposal = await queryClient.fetchQuery({
          queryKey: ['proposal', daoId, pid],
          queryFn: () => daoService.getProposal(compositeId),
          staleTime: 0,
        })
        found = !!proposal
      } catch {
        // transient — keep waiting
      }
      if (cancelled) return
      if (found || attempts >= MAX_ATTEMPTS) go()
      else timer = setTimeout(tick, INTERVAL_MS)
    }

    timer = setTimeout(tick, INTERVAL_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [submittedProposalId, daoId, navigate, queryClient])

  // ── Shared helpers ───────────────────────────────────────────────────

  /** Parse expiration duration string to a future Unix timestamp (seconds), or 0 for none. */
  function parseExpiration(expirationInput: string | undefined): number {
    if (!expirationInput?.trim()) return 0
    const seconds = parseDurationToSeconds(expirationInput)
    if (!seconds || seconds <= 0) return 0
    return Math.floor(Date.now() / 1000) + seconds
  }

  /** Common fields all forms emit alongside their specific data. */
  interface SharedFormFields {
    title: string
    description: string
    offering: string
    expiration?: string
    discussionUrl?: string
  }

  const [showConfirm, setShowConfirm] = useState(false)
  const pendingSubmission = useRef<{
    proposalData: string; details: string; expiration: number; title: string
  } | null>(null)

  function submitEncoded(
    data: SharedFormFields,
    encoded: { proposalData: string },
    proposalType?: string,
  ) {
    const detailsObj: Record<string, string> = { title: data.title }
    if (proposalType) detailsObj.type = proposalType
    if (data.discussionUrl) detailsObj.discussionUrl = data.discussionUrl
    if (data.description?.trim()) detailsObj.description = data.description.trim()
    const details = JSON.stringify(detailsObj)
    const expiration = parseExpiration(data.expiration)
    pendingSubmission.current = {
      proposalData: encoded.proposalData,
      details,
      expiration,
      title: data.title,
    }
    setShowConfirm(true)
  }

  function confirmSubmit() {
    if (!pendingSubmission.current) return
    submitMutation.mutate(pendingSubmission.current)
    setShowConfirm(false)
    pendingSubmission.current = null
  }

  // ── Form submission handlers ──────────────────────────────────────────

  const handleFundingSubmit = (data: SharedFormFields & {
    recipient: string; tokenAddress: string; amount: string
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)
      encoder.addTransfer(data.recipient, data.tokenAddress, quais.parseQuai(data.amount))
      submitEncoded(data, encoder.encode(), 'funding')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleMembershipSubmit = (data: SharedFormFields & {
    members: Array<{ address: string; amount: string; tokenType: 'shares' | 'loot'; action: 'mint' | 'burn' }>
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)
      const mintShares = data.members.filter((m) => m.action === 'mint' && m.tokenType === 'shares')
      const burnShares = data.members.filter((m) => m.action === 'burn' && m.tokenType === 'shares')
      const mintLoot = data.members.filter((m) => m.action === 'mint' && m.tokenType === 'loot')
      const burnLoot = data.members.filter((m) => m.action === 'burn' && m.tokenType === 'loot')

      if (mintShares.length > 0) encoder.addMintShares(mintShares.map((m) => m.address), mintShares.map((m) => quais.parseQuai(m.amount)))
      if (burnShares.length > 0) encoder.addBurnShares(burnShares.map((m) => m.address), burnShares.map((m) => quais.parseQuai(m.amount)))
      if (mintLoot.length > 0) encoder.addMintLoot(mintLoot.map((m) => m.address), mintLoot.map((m) => quais.parseQuai(m.amount)))
      if (burnLoot.length > 0) encoder.addBurnLoot(burnLoot.map((m) => m.address), burnLoot.map((m) => quais.parseQuai(m.amount)))

      submitEncoded(data, encoder.encode(), 'membership')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleGovernanceSubmit = (data: SharedFormFields & {
    votingPeriod: number; gracePeriod: number; quorumPercent: number
    proposalOffering: string; sponsorThreshold: string; minRetentionPercent: number
    defaultExpiryWindow: number
  }) => {
    setSubmitError(null)
    try {
      const config = {
        votingPeriod: data.votingPeriod,
        gracePeriod: data.gracePeriod,
        quorumPercent: BigInt(data.quorumPercent),
        proposalOffering: BigInt(data.proposalOffering),
        sponsorThreshold: BigInt(data.sponsorThreshold),
        minRetentionPercent: BigInt(data.minRetentionPercent),
        defaultExpiryWindow: data.defaultExpiryWindow,
      }
      const encoder = new ProposalEncoder(dao.id)
      if (activeTimelock) {
        // A timelock is active — ALWAYS route through it: queue the same config blob via
        // queueChange so it takes effect only after the delay (a second ragequit window).
        // The standard governance form offers no bypass; a direct change would require the
        // advanced custom-action path, which the indexer still flags as a bypass.
        const action = buildQueueChangeAction(activeTimelock.address, config)
        encoder.addCustomAction(action.to, 0n, action.data)
        submitEncoded(data, encoder.encode(), 'governance_config_timelock')
      } else {
        // No timelock — apply the config change directly.
        encoder.addSetGovernanceConfig(config)
        submitEncoded(data, encoder.encode(), 'governance_config')
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleGuildTokensSubmit = (data: SharedFormFields & {
    tokens: Array<{ address: string; enabled: boolean }>
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)
      encoder.addSetGuildTokens(data.tokens.map((t) => t.address), data.tokens.map((t) => t.enabled))
      submitEncoded(data, encoder.encode(), 'custom')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleCustomSubmit = (data: SharedFormFields & {
    actions: Array<{ to: string; value: string; data: string }>
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)
      for (const action of data.actions) {
        encoder.addCustomAction(action.to, BigInt(action.value), action.data)
      }
      submitEncoded(data, encoder.encode(), 'custom')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleProfileSubmit = (data: SharedFormFields & {
    profile: { name: string; description: string; avatar: string; banner: string; theme?: DaoTheme; links: Record<string, string>; tags: string[] }
    currentProfile: { name?: string; description?: string; avatar?: string; banner?: string; theme?: DaoTheme; links?: Record<string, string>; tags?: string[] }
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)

      const update = buildProfileUpdate(dao.id, data.currentProfile, data.profile)
      if (!update) {
        setSubmitError('No profile changes detected')
        return
      }

      // Always use DAO_PROFILE — supports partial updates (null removes, omit keeps)
      // Add schemaVersion for indexer compliance
      const payload = { schemaVersion: '1.0', ...update }

      encoder.addPosterPost(CONTRACT_ADDRESSES.POSTER, JSON.stringify(payload), POSTER_TAGS.DAO_PROFILE)
      submitEncoded(data, encoder.encode(), 'profile_update')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleAnnouncementSubmit = (data: SharedFormFields & {
    announcementTitle: string
    announcementBody: string
    severity: 'info' | 'warning' | 'critical'
    announcementUrl: string
    announcementExpiresAt: string
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)
      const payload: Record<string, unknown> = {
        schemaVersion: '1.0',
        daoAddress: dao.id.toLowerCase(),
        title: data.announcementTitle,
        body: data.announcementBody || undefined,
        severity: data.severity,
      }
      if (data.announcementUrl) payload.url = data.announcementUrl
      if (data.announcementExpiresAt) payload.expiresAt = new Date(data.announcementExpiresAt).toISOString()
      encoder.addPosterPost(CONTRACT_ADDRESSES.POSTER, JSON.stringify(payload), POSTER_TAGS.DAO_ANNOUNCEMENT)
      submitEncoded(data, encoder.encode(), 'announcement')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleNavigatorSubmit = (data: SharedFormFields & {
    navigators: Array<{ address: string; permission: number }>
  }) => {
    setSubmitError(null)
    try {
      const encoder = new ProposalEncoder(dao.id)
      encoder.addSetNavigators(
        data.navigators.map((n) => n.address),
        data.navigators.map((n) => BigInt(n.permission)),
      )
      submitEncoded(data, encoder.encode(), 'navigator')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  const handleNavigatorSanctionSubmit = (data: SharedFormFields & {
    navigators: Array<{ address: string; type?: string }>
  }) => {
    setSubmitError(null)
    try {
      // Vault post of the DAO's COMPLETE sanctioned read-only-navigator set, wrapped as a
      // governance proposal so msg.sender is the avatar (VERIFIED). Last-write-wins.
      const content = posterService.buildSanctionNavigatorsContent(dao.id, data.navigators)
      const encoder = new ProposalEncoder(dao.id)
      encoder.addPosterPost(CONTRACT_ADDRESSES.POSTER, content, POSTER_TAGS.DAO_NAVIGATORS)
      submitEncoded(data, encoder.encode(), 'navigator_sanction')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Invalid proposal parameters')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold font-display text-dao-text">
          Connect your wallet to create a proposal
        </h2>
        <p className="text-dao-text-muted text-center max-w-md">
          You need a connected wallet and DAO membership to submit proposals.
        </p>
        <ConnectWallet />
      </div>
    )
  }

  // Submission requires membership (shares or loot). Wait for the member query to settle
  // first so a real member never flashes the block screen, then gate non-members out.
  if (memberLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="sm" />
      </div>
    )
  }

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold font-display text-dao-text">
          Only members can create proposals
        </h2>
        <p className="text-dao-text-muted text-center max-w-md">
          You need shares or loot in this DAO to submit a proposal. Join through one of the DAO's
          navigators, then come back to create one.
        </p>
        <Link to={`/dao/${daoId}`} className="btn-primary">
          Back to DAO
        </Link>
      </div>
    )
  }

  // Submitted — confirmation state while we wait for the proposal to sync, then redirect.
  if (submittedProposalId !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <svg aria-hidden="true" className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold font-display text-dao-text">Proposal submitted!</h2>
          <p className="text-dao-text-muted mt-1 max-w-md">
            Waiting for it to sync, then we'll take you to your proposal…
          </p>
        </div>
        <Loading size="sm" />
      </div>
    )
  }

  // Build vault token options with balances for FundingForm.
  // useTreasuryBalances already filters to enabled guild tokens only.
  const hasNativeInGuildTokens = (balances?.tokenBalances ?? []).some((tb) => tb.isNative)
  const vaultTokenOptions: VaultTokenOption[] = [
    // Add native QUAI if not already in guild tokens
    ...(!hasNativeInGuildTokens ? [{
      address: ZERO_ADDRESS,
      symbol: 'QUAI',
      name: 'Quai',
      decimals: 18,
      balance: balances?.nativeBalance ?? 0n,
      isNative: true,
    }] : []),
    // Guild tokens (native + ERC-20) with live balances
    ...(balances?.tokenBalances ?? []).map((tb) => ({
      address: tb.address,
      symbol: tb.symbol,
      name: tb.name,
      decimals: tb.decimals,
      balance: tb.balance,
      isNative: tb.isNative,
    })),
  ]

  // Current guild tokens for the GuildTokensForm (all tokens, including disabled)
  const currentGuildTokens = (treasury ?? []).map((t) => ({ address: t.token_address, enabled: t.enabled }))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: dao.name || `DAO ${dao.id.slice(0, 8)}...`, href: `/dao/${daoId}` },
        { label: 'Proposals', href: `/dao/${daoId}/proposals` },
        { label: 'New' },
      ]} />

      <h1 className="text-2xl font-bold font-display text-dao-text">New Proposal</h1>

      {/* Type selection */}
      {!selectedType ? (
        <div className="space-y-6">
          <p className="text-dao-text-muted">
            What kind of proposal do you want to create?
          </p>
          {PROPOSAL_CATEGORIES.map((category) => {
            const items = PROPOSAL_TYPES.filter((t) => t.category === category)
            if (items.length === 0) return null
            return (
              <div key={category}>
                <h3 className="text-xs font-semibold text-dao-text-hint uppercase tracking-wider mb-2">{category}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => setSelectedType(opt.type)}
                      className="card px-4 py-3.5 text-left hover:border-accent-500/50 hover:-translate-y-0.5 transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/40 border border-primary-200 dark:border-primary-700/30 flex items-center justify-center flex-shrink-0">
                          <svg aria-hidden="true" className="w-4.5 h-4.5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm text-dao-text font-semibold group-hover:text-accent-400 transition-colors">
                            {opt.label}
                          </h4>
                          <p className="text-xs text-dao-text-muted">{opt.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected type header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedType(null); setSubmitError(null) }}
              className="text-sm text-dao-text-muted hover:text-dao-text transition-colors"
            >
              &larr; Change type
            </button>
            <span className="text-sm text-dao-text-hint">|</span>
            <span className="text-sm text-primary-400 font-medium">
              {PROPOSAL_TYPES.find((t) => t.type === selectedType)?.label}
            </span>
          </div>

          <Card header={
            <h2 className="text-lg font-semibold text-dao-text">
              {PROPOSAL_TYPES.find((t) => t.type === selectedType)?.label} Proposal
            </h2>
          }>
            {selectedType === ProposalType.Funding && (
              <FundingForm
                daoId={daoId!}
                vaultTokens={vaultTokenOptions}
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleFundingSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {selectedType === ProposalType.Membership && (
              <MembershipForm
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleMembershipSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {selectedType === ProposalType.GuildTokens && (
              <GuildTokensForm
                currentGuildTokens={currentGuildTokens}
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleGuildTokensSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {selectedType === ProposalType.GovConfig && (
              <GovernanceForm
                daoId={dao.id}
                currentConfig={extractDaoConfig(dao)}
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleGovernanceSubmit}
                isSubmitting={isSubmitting}
                activeTimelock={activeTimelock}
              />
            )}

            {selectedType === ProposalType.Navigator && (
              <NavigatorForm
                currentNavigators={navigators || []}
                daoLocks={{
                  admin: dao.admin_locked,
                  manager: dao.manager_locked,
                  governor: dao.governor_locked,
                }}
                prefill={prefillNavigator}
                prefillName={prefillNavigatorName}
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleNavigatorSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {selectedType === ProposalType.NavigatorSanction && (navigatorsLoading || navigatorsError) && (
              <div className={`border rounded-lg px-4 py-3 ${navigatorsError
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-dao-surface/60 border-dao-border'}`}>
                <p className={`text-sm ${navigatorsError ? 'text-red-400 font-medium' : 'text-dao-text-hint'}`}>
                  {navigatorsError
                    ? "Could not load this DAO's navigators."
                    : "Loading this DAO's navigators…"}
                </p>
                {navigatorsError && (
                  <p className="text-xs text-dao-text-muted mt-0.5">
                    A sanction proposal replaces the DAO&apos;s entire endorsement set, so it
                    cannot be built from an incomplete list — it would silently revoke every
                    existing endorsement.
                  </p>
                )}
              </div>
            )}
            {selectedType === ProposalType.NavigatorSanction && !navigatorsLoading && !navigatorsError && (
              <NavigatorSanctionForm
                readOnlyNavigators={(navigators || []).filter(
                  (n) => n.permission === NavigatorPermission.None && !n.permission_ever_granted,
                )}
                prefillAddress={prefillSanctionAddress}
                prefillMode={prefillSanctionMode}
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleNavigatorSanctionSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {selectedType === ProposalType.Profile && (() => {
              const profileContent = profileRecord?.content ? safeJsonParse(profileRecord.content) : null
              const rawLinks = profileContent && typeof profileContent === 'object'
                ? (profileContent as Record<string, unknown>).links : null
              const profileLinks: Record<string, string> = {}
              if (rawLinks && typeof rawLinks === 'object' && !Array.isArray(rawLinks)) {
                for (const [k, v] of safeEntries(rawLinks as Record<string, unknown>)) {
                  if (typeof v === 'string') profileLinks[k] = v
                }
              }
              const rawTags = profileContent && typeof profileContent === 'object'
                ? (profileContent as Record<string, unknown>).tags : null
              const profileTags: string[] = Array.isArray(rawTags)
                ? rawTags.filter((t): t is string => typeof t === 'string')
                : []
              return (
                <ProfileForm
                  currentProfile={{
                    name: dao.name || '',
                    description: dao.description || '',
                    avatar: dao.avatar_img || safeString(profileContent, 'avatar') || '',
                    banner: safeString(profileContent, 'banner') || '',
                    theme: extractTheme(profileContent) ?? undefined,
                    links: profileLinks,
                    tags: profileTags,
                  }}
                  minOfferingDisplay={minOfferingDisplay}
                  canSelfSponsor={canSelfSponsor}
                  onSubmit={handleProfileSubmit}
                  isSubmitting={isSubmitting}
                />
              )
            })()}

            {selectedType === ProposalType.Announcement && (
              <AnnouncementForm
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleAnnouncementSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {selectedType === ProposalType.Custom && (
              <CustomActionForm
                minOfferingDisplay={minOfferingDisplay}
                canSelfSponsor={canSelfSponsor}
                onSubmit={handleCustomSubmit}
                isSubmitting={isSubmitting}
                vaultAddress={dao.avatar}
                knownTokens={(balances?.tokenBalances ?? [])
                  .filter((tb) => !tb.isNative)
                  .map((tb) => ({ address: tb.address, symbol: tb.symbol, name: tb.name, decimals: tb.decimals, balance: tb.balance }))}
                prefillActions={prefillCustomActions}
                prefillTitle={prefillCustomTitle}
                prefillDescription={prefillCustomDescription}
              />
            )}

            {submitError && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg px-4 py-3 space-y-2">
                {submitError.split('\n\n').map((line, i) => (
                  <p key={i} className={`text-sm ${i === 0 ? 'text-red-400 font-medium' : 'text-red-400/80'}`}>
                    {line}
                  </p>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      {/* Confirmation dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => { setShowConfirm(false); pendingSubmission.current = null }}
        onConfirm={confirmSubmit}
        title="Confirm Proposal Submission"
        message={(() => {
          const p = pendingSubmission.current
          if (!p) return null
          let parsed: Record<string, string> = {}
          try { parsed = JSON.parse(p.details) } catch { /* ok */ }
          return (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-dao-text-hint text-xs mb-0.5">Title</p>
                <p className="text-dao-text font-medium">{parsed.title || p.title}</p>
              </div>
              {parsed.description && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Description</p>
                  <p className="text-dao-text-secondary line-clamp-3">{parsed.description}</p>
                </div>
              )}
              {parsed.type && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Type</p>
                  <p className="text-dao-text-secondary capitalize">{parsed.type.replace(/_/g, ' ')}</p>
                </div>
              )}
              {parsed.discussionUrl && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Discussion</p>
                  <p className="text-dao-text-secondary font-mono text-xs truncate">{parsed.discussionUrl}</p>
                </div>
              )}
              {!canSelfSponsor && minOffering > 0n && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Offering</p>
                  <p className="text-dao-text-secondary">{minOfferingDisplay} QUAI</p>
                </div>
              )}
              {p.expiration > 0 && (
                <div>
                  <p className="text-dao-text-hint text-xs mb-0.5">Expiration</p>
                  <p className="text-dao-text-secondary">{new Date(p.expiration * 1000).toLocaleString()}</p>
                </div>
              )}
              <p className="text-dao-text-hint text-xs pt-1 border-t border-dao-border">
                {canSelfSponsor
                  ? 'This proposal will be self-sponsored and enter voting immediately.'
                  : 'This proposal will need to be sponsored before voting can begin.'}
              </p>
            </div>
          )
        })()}
        confirmText="Submit Proposal"
        variant="info"
        isLoading={submitMutation.isPending}
      />
    </div>
  )
}

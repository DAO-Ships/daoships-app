// ═══════════════════════════════════════════════════════════════════════════
// Navigator sanction — is a deployed navigator actually active for its DAO yet?
// ───────────────────────────────────────────────────────────────────────────
// A navigator can be deployed (and its Poster post made) while the governance proposal
// that officially adds it never passes — leaving it listed but not actionable. The action
// to fix that differs by class:
//   • permissioned (Onboarder/ERC20/NFT/Vesting/Subscription/Timelock) — grant a permission
//     bit via setNavigators.
//   • module (Budget) — enable it as a vault (Zodiac) module via vault.enableModule.
//   • read-only (Signal) — sanction it via a daoships.dao.navigators Poster set.
// The class is derived from the catalog (intended role), NOT runtime permission bits — a
// permissioned navigator that was never granted reads as permission 0, identical to a
// read-only one, so the bits alone can't classify it.
// ═══════════════════════════════════════════════════════════════════════════

import type { Navigator } from '@/types'
import { getCatalogEntry } from '@/config/navigatorCatalog'
import { buildEnableModuleAction, buildBudgetProposalHref } from '@/utils/budgetProposals'

export type NavigatorSanctionClass = 'readonly' | 'permissioned' | 'module'

export interface NavigatorSanctionInfo {
  /** True when the navigator is listed but not yet actionable for this DAO. */
  needsSanction: boolean
  sanctionClass: NavigatorSanctionClass
  /** Member-facing proposal deep-link, or null if it can't be built yet (module w/o vault). */
  href: string | null
  /** Button label for the proposal CTA. */
  ctaLabel: string
  /** Short status title. */
  title: string
  /** One-line explanation of the state + that any member can propose the fix. */
  description: string
}

/** Classify a navigator by its catalog entry (intended role), not its runtime permission. */
function classify(navigator: Navigator): NavigatorSanctionClass | null {
  const entry = navigator.navigator_type ? getCatalogEntry(navigator.navigator_type) : null
  if (!entry) return null
  if (entry.permission > 0) return 'permissioned'
  if (entry.pattern === 'treasury') return 'module'
  return 'readonly'
}

/**
 * Whether a navigator is managed through the DAOShip permission set (setNavigators) — i.e.
 * belongs in the "navigator permissions" proposal form. Read-only (Signal) and vault-module
 * (Budget) navigators are NOT: they're sanctioned via the `daoships.dao.navigators` Poster set
 * and enabled via `vault.enableModule` respectively, so a "Disable"/permission control is
 * meaningless (and misleading) for them.
 *
 * Anything that holds or ever held a permission is always managed here (so a rogue/custom
 * permissioned navigator can always be revoked). Unknown types default to managed.
 */
export function isPermissionManagedNavigator(navigator: Navigator): boolean {
  if (navigator.permission > 0 || navigator.permission_ever_granted) return true
  const cls = classify(navigator)
  return cls !== 'readonly' && cls !== 'module'
}

/**
 * Whether a navigator is listed but not yet actionable for its DAO. Needs only the
 * navigator row (no daoId/vault), so list views can badge cheaply.
 */
export function navigatorNeedsSanction(navigator: Navigator): boolean {
  const cls = classify(navigator)
  if (!cls) return false
  // Impersonation-flagged navigators are hidden from the list; never invite sanctioning one.
  if (navigator.trust_status === 'fabricated') return false

  if (cls === 'permissioned') {
    const entry = getCatalogEntry(navigator.navigator_type!)!
    return (navigator.permission & entry.permission) === 0
  }
  if (cls === 'module') {
    // Budget's "enabled" test (mirrors BudgetPlugin): sanctioned trust AND active as a module.
    return !(navigator.trust_status === 'sanctioned' && navigator.is_active)
  }
  // read-only (Signal): surfaced only once the DAO sanctions it.
  return navigator.trust_status !== 'sanctioned'
}

/**
 * Full sanction info for a navigator — the "needs activation" state plus the exact, class-
 * correct proposal deep-link and copy. Returns null when the type can't be classified.
 */
export function getNavigatorSanctionInfo(
  navigator: Navigator,
  opts: { daoId: string; vaultAddress?: string | null },
): NavigatorSanctionInfo | null {
  const cls = classify(navigator)
  if (!cls) return null

  const needsSanction = navigatorNeedsSanction(navigator)
  const addr = navigator.navigator_address
  const { daoId, vaultAddress } = opts

  if (cls === 'permissioned') {
    const entry = getCatalogEntry(navigator.navigator_type!)!
    const nameParam = navigator.name ? `&addName=${encodeURIComponent(navigator.name)}` : ''
    return {
      needsSanction,
      sanctionClass: 'permissioned',
      href: `/dao/${daoId}/proposals/new?type=navigator&addAddress=${addr}&addPermission=${entry.permission}${nameParam}`,
      ctaLabel: `Propose granting ${entry.permissionLabel}`,
      title: 'Not yet active',
      description: `This navigator needs the ${entry.permissionLabel} permission before it can act. Any member can propose granting it through governance.`,
    }
  }

  if (cls === 'module') {
    return {
      needsSanction,
      sanctionClass: 'module',
      href: vaultAddress
        ? buildBudgetProposalHref(daoId, buildEnableModuleAction(vaultAddress, addr))
        : null,
      ctaLabel: 'Propose enabling treasury access',
      title: 'Not yet enabled',
      description:
        'This navigator must be enabled as a treasury (vault) module before it can move funds. Any member can propose enabling it through governance.',
    }
  }

  return {
    needsSanction,
    sanctionClass: 'readonly',
    href: `/dao/${daoId}/proposals/new?type=navigator-sanction&sanctionAddress=${addr}`,
    ctaLabel: 'Propose sanctioning',
    title: 'Not yet sanctioned',
    description:
      "The DAO hasn't sanctioned this navigator, so its activity won't surface as DAO-endorsed. Any member can propose sanctioning it through governance.",
  }
}

export interface NavigatorUnsanctionInfo {
  href: string
  ctaLabel: string
  title: string
  description: string
}

/**
 * For a read-only navigator that IS currently sanctioned, the member-facing deep-link to
 * propose UN-sanctioning just this one (the DAO's other endorsements are preserved). Returns
 * null for non-read-only navigators, or read-only ones that aren't currently sanctioned (those
 * use getNavigatorSanctionInfo's "propose sanctioning" path instead). This is the on-page
 * inverse of sanctioning — both directions live on the navigator page.
 */
export function getNavigatorUnsanctionInfo(
  navigator: Navigator,
  opts: { daoId: string },
): NavigatorUnsanctionInfo | null {
  if (classify(navigator) !== 'readonly') return null
  if (navigator.trust_status !== 'sanctioned') return null
  return {
    href: `/dao/${opts.daoId}/proposals/new?type=navigator-sanction&sanctionAddress=${navigator.navigator_address}&sanctionMode=remove`,
    ctaLabel: 'Propose unsanctioning',
    title: 'Sanctioned by the DAO',
    description:
      "This navigator is endorsed, so its activity surfaces as DAO-sanctioned. Any member can propose unsanctioning it — its polls would stop surfacing; the DAO's other endorsements are preserved.",
  }
}

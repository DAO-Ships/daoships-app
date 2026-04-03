# DAOShips Frontend UX Overhaul Plan

**Created**: 2026-04-01
**Last Audited**: 2026-04-01
**Status**: Planning
**Scope**: Comprehensive UI/UX elevation across the entire application
**Goal**: Transform from "functional dark-themed DAO tool" to "premium governance platform"

> **Audit notes**: Plan audited for gaps on 2026-04-01. The following were identified and addressed:
> - Navigator pages, Settings page, and Launch wizard were missing — added as Tier 4.5 and new Tier 8
> - `ConfirmDialog` and `Modal` already exist — corrected in gaps table and Tier 7.2
> - `.input` class already has focus styling — Tier 1.1 updated to note `focus` → `focus-visible` migration
> - `daoStore` must be expanded to store DAO name — specified in Tier 1.5
> - `animate-slide-in` is broken today (NotificationContainer) — added to Tier 1 as bug fix
> - Breadcrumb component moved from Tier 6 to Tier 1 to prevent ad-hoc proliferation
> - Card entrance stagger must be mount-only to avoid re-trigger on realtime updates — noted in Tier 1.3
> - Realtime subscription hooks must be preserved in Tier 2 restructure — noted in Tier 2.1
> - Members responsive breakpoint standardized on `md` (768px) — updated in Tier 4.3
> - Light mode compatibility must be verified for all tiers — added to Implementation Notes

---

## Tier 1: Foundation (1-2 days)

Immediate visual lift across the entire app. No structural changes — just CSS, animations, and one small component update.

### 1.1 Focus Rings on All Interactive Elements
- **Priority**: P0 (accessibility failure)
- **Files**: `src/index.css`
- **What**: Add `focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2` to `.btn-primary`, `.btn-secondary`, `.btn-danger`, and `.card` (when used as links). For `.input`, migrate existing `focus:ring-2 focus:ring-primary-500` to `focus-visible:ring-2 focus-visible:ring-primary-500` (input already has focus styling — this changes it to keyboard-only).
- **Why**: Keyboard users currently get no visible focus indicator on buttons or cards. This fails WCAG 2.1 AA.
- **Note**: Use theme-aware ring-offset color. `ring-offset-dao-dark-1` resolves via CSS custom property (`var(--dao-bg-1)`) so it works in both light and dark themes, but verify visually in both modes.

### 1.2 Resting Shadows on Cards
- **Priority**: P1
- **Files**: `src/index.css` (`.card` class)
- **What**: Add a subtle resting shadow to the `.card` class. Use `shadow-sm` or a custom `shadow-dao-card-rest` that's lighter than the existing `shadow-dao-card`.
- **Why**: Most cards are flat with only a 1px border. Adding subtle depth creates visual layering and a more polished feel.

### 1.3 Page Fade-In Animation + Card Entrance Stagger
- **Priority**: P1
- **Files**: `tailwind.config.js`, `src/App.tsx`, `src/pages/Explore.tsx`, `src/pages/dao/Overview.tsx`, `src/components/dao/DaoCard.tsx`
- **What**:
  - Add `animate-fade-in` keyframe to tailwind config (opacity 0→1, translateY 8px→0, 300ms ease-out). Also fix `animate-slide-in` which is used by NotificationContainer but not defined in the config (pre-existing bug).
  - Apply to the `<Suspense>` content wrapper in App.tsx so lazy-loaded pages fade in
  - For card grids (Explore, Overview proposals), apply staggered `animation-delay` (50ms per card) via inline style
- **Why**: Content currently pops in with no transition. A simple fade masks lazy-load jarring and creates a professional cascade effect on grids.
- **Important**: Stagger animations must be gated to initial mount only (via a ref that tracks whether the component has already animated). Otherwise, realtime subscription updates that re-render the list will re-trigger the animation, causing a distracting flash.

### 1.4 Button Press Feedback + Card Hover Lift
- **Priority**: P2
- **Files**: `src/index.css` (button classes), `src/components/dao/DaoCard.tsx`
- **What**:
  - Add `active:scale-[0.98]` to all button variants
  - Add `hover:-translate-y-0.5 transition-transform` to DaoCard and any card used as a link
- **Why**: Gives tactile feedback on button press and a subtle lift effect on hoverable cards. Small touches that signal interactivity.

### 1.5 DAO Name in Header
- **Priority**: P0
- **Files**: `src/components/layout/Header.tsx`, `src/components/layout/DaoLayout.tsx`, `src/store/daoStore.ts`
- **What**: When the user is inside a `/dao/:daoId` route, display the DAO name (and optionally a small avatar) in the Header next to "DAO Ships". Display as breadcrumb-style: `DAO Ships / MyDAO`.
- **Why**: Users currently have no persistent indication of which DAO they are viewing. The Header always says "DAO Ships" regardless of context.
- **Implementation**: Expand `daoStore` to store `currentDaoName: string | null` alongside the existing `currentDaoId`. Set both in `DaoLayout` where the DAO data is already loaded (the store already calls `setCurrentDao(daoId)` on mount). Header reads `currentDaoName` from the store. This avoids a redundant DAO query.

### 1.6 Breadcrumb Component
- **Priority**: P1
- **Files**: New `src/components/common/Breadcrumb.tsx`, `src/components/layout/DaoLayout.tsx`
- **What**: A reusable breadcrumb trail component: `<Breadcrumb items={[{label, href}, ...]} />`. Integrate into DaoLayout as an auto-generated trail from the route path + DAO name. Replace all manually-built breadcrumbs across pages (currently every DAO sub-page builds its own with inconsistent styling — some use `text-dao-text-muted`, others use `text-dao-text-hint`).
- **Why**: Users navigating deep (Explore → DAO → Proposals → #5) have no consistent way to retrace steps. Creating this early prevents more ad-hoc breadcrumbs as other tiers are implemented.
- **Dependencies**: Requires Tier 1.5 (`currentDaoName` in daoStore) for the DAO name segment.

---

## Tier 2: Proposal Detail Overhaul (2-3 days)

The single highest-impact page redesign. Transforms the proposal viewing and voting experience.

### 2.1 Two-Column Layout with Sticky VotingSidebar
- **Priority**: P0
- **Files**: `src/pages/dao/ProposalDetail.tsx` (major restructure), new `src/components/proposal/VotingSidebar.tsx`, new `src/components/proposal/VotingProgress.tsx`
- **What**: Split ProposalDetail into two columns on desktop:
  - **Left column** (scrollable): Header/title, result banner, ProposalActionSummary (decoded actions), metadata (submitter, sponsor, offering, dates), Vote Reasons
  - **Right column** (sticky): VotingSidebar containing VotingProgress (yes/no bars + quorum), CountdownTimeline (compact), ProposalActions (vote/sponsor/process/cancel buttons)
- **Layout**: `lg:grid lg:grid-cols-[1fr,360px] gap-6`. On mobile, single column with sidebar content above the detailed content.
- **Why**: Vote buttons are currently item #8 on the page. Members must scroll past metadata, decoded actions, voting progress, AND timeline to find "Vote Yes / Vote No". Moving actions to a sticky sidebar means they're always visible while the member reads the proposal.
- **Component hierarchy**:
  ```
  ProposalDetail
    -> ProposalHeader (title, badge, description, discussion link)
    -> ResultBanner (for terminal proposals)
    -> Grid [left, right]
      -> Left: ProposalActionSummary, ProposalMetadata, VoteReasons
      -> Right (sticky): VotingSidebar
          -> VotingProgress (extracted from inline JSX)
          -> CountdownTimeline (embedded, compact)
          -> ProposalActions (embedded)
  ```
- **Realtime subscriptions**: `useRealtimeProposal` and `useRealtimeVotes` must remain in the parent `ProposalDetail` component (where they currently live). They invalidate React Query caches, which triggers re-renders in child components. Do not move them into `VotingSidebar` — they affect the entire page's data.

### 2.2 Sticky Mobile Action Bar
- **Priority**: P1
- **Files**: `src/pages/dao/ProposalDetail.tsx`
- **What**: On mobile (below `lg` breakpoint), render vote buttons as a `fixed bottom-0` bar that stays visible while scrolling. Only visible for active proposals where the user has actions available.
- **Why**: On mobile, after scrolling past the header, vote buttons disappear entirely. A fixed bottom bar ensures members can always act.

### 2.3 Terminal Proposal Styling
- **Priority**: P2
- **Files**: `src/pages/dao/ProposalDetail.tsx`
- **What**: For processed/defeated/cancelled proposals:
  - Collapse to single-column layout (no sticky sidebar needed)
  - Result banner is prominent at top with embedded final vote tally ("Passed 67% to 33%, quorum met")
  - Voting progress bars use muted/desaturated colors
  - Overall visual tone communicates "historical record, not actionable"
- **Why**: Active and terminal proposals currently look identical. Terminal proposals should feel settled.

### 2.4 Connect Wallet Prompt
- **Priority**: P2
- **Files**: `src/components/proposal/ProposalActions.tsx`
- **What**: When `!userAddress`, instead of rendering `null` (for non-connected users on terminal proposals) or a plain text message, render a styled prompt: "Connect your wallet to vote on this proposal" with the wallet connect button.
- **Why**: Disconnected users see no indication that actions exist. A clear CTA increases engagement.

---

## Tier 3: Proposal List + Creation (1-2 days)

Improve proposal discoverability and creation flow.

### 3.1 Count Badges on Filter Tabs
- **Priority**: P1
- **Files**: `src/pages/dao/Proposals.tsx`
- **What**: Add count badges to each filter tab: `[All (12)] [Voting (3)] [Grace (1)] [Ready (2)] [Passed (4)] [Failed (2)]`. Compute from the `withStatus` array that already exists in the `useMemo`.
- **Why**: Members cannot see "3 proposals need my vote" at a glance without clicking each tab. This is the most important triage signal.

### 3.2 Proposal Type Indicator on List Cards
- **Priority**: P1
- **Files**: `src/pages/dao/Proposals.tsx` (`ProposalCard` component)
- **What**: Add a small colored pill before the title showing the proposal type (Funding, Membership, Governance, etc.). Use `parseProposalDetails(proposal.details).type` which already extracts the type from the on-chain details JSON.
- **Why**: Two proposals with similar titles are indistinguishable without clicking through.

### 3.3 Dual-Color Yes+No Progress Bar
- **Priority**: P1
- **Files**: `src/pages/dao/Proposals.tsx` (`ProposalCard`)
- **What**: Replace the current green-only bar with a dual-color bar: green portion (yes%) + red portion (no%) + gray remainder (unvoted). A proposal at 51% yes looks very different from 99% yes.
- **Why**: The current bar only shows "yes" percentage. A member cannot visually assess the vote split without reading the numbers.

### 3.4 Group Proposal Types by Category
- **Priority**: P2
- **Files**: `src/pages/dao/NewProposal.tsx` (type selector section)
- **What**: Group the 8 proposal types under category headers:
  - **Treasury**: Funding, Guild Tokens
  - **Members**: Membership
  - **Governance**: Governance Config, Navigators
  - **Communication**: Profile Update, Announcement
  - **Advanced**: Custom Action
- **Why**: 8 flat options is overwhelming for a new user. Grouping provides cognitive scaffolding.

### 3.5 Reorder Form Fields
- **Priority**: P2
- **Files**: All form components in `src/components/proposal/forms/` (FundingForm, MembershipForm, GovernanceForm, GuildTokensForm, NavigatorForm, ProfileForm, AnnouncementForm)
- **What**: Reorder each form to: (1) Action-specific fields first ("What does this proposal do?"), (2) Proposal metadata second (title, description, discussion URL, expiration, rationale), (3) Submission last (offering + submit button). Currently metadata is split across the form — title/description at top, settings at bottom.
- **Why**: Clearer mental model. The proposer thinks about *what* first, then *why* and *when*.
- **Consideration**: This changes the tab order and visual flow of every form. Needs careful testing.

---

## Tier 4: Members Page (2-3 days)

Transform the members list from a data dump into a proper data table.

### 4.1 Table Header Row
- **Priority**: P0
- **Files**: `src/pages/dao/Members.tsx` (`MemberRow` component)
- **What**: Add a sticky header row with column labels (Member, Shares, Loot, Voting Power, Power %, Sponsored). Remove the per-row tiny gray labels that currently repeat on every row.
- **Why**: The current design wastes vertical space and forces the eye to re-read column labels on each row instead of scanning a column top-to-bottom.

### 4.2 Search + Sort Controls
- **Priority**: P0
- **Files**: `src/pages/dao/Members.tsx`
- **What**: Add a search input (filter by name or address) and a sort dropdown (by shares, voting power, power %, sponsored count). Default sort: voting power descending.
- **Why**: Any DAO with 20+ members becomes unusable without this.

### 4.3 Mobile Responsive Member Rows
- **Priority**: P0
- **Files**: `src/pages/dao/Members.tsx` (`MemberRow`)
- **What**: On screens below `md` breakpoint (768px), collapse to 2-3 key stats (voting power + power %) with an expandable detail row showing shares/loot/sponsored. The current 5-column layout overflows on screens under ~900px.
- **Why**: The flex layout with 5 inline stat columns breaks on mobile and tablet.
- **Note**: Use `md` (768px) as the collapse breakpoint, not `sm` (640px). A 5-column table doesn't fit between 640-768px either. This is consistent with the `lg` breakpoint used for ProposalDetail's two-column layout.

### 4.4 Member Picker for Delegation
- **Priority**: P1
- **Files**: `src/pages/dao/Members.tsx`, new component `src/components/member/MemberPicker.tsx`
- **What**: Replace the raw text input for delegation with a searchable dropdown that shows member names, avatars, and addresses from the existing member list. Typing filters the list. Selecting a member fills the address. Show each candidate's current voting power.
- **Why**: Pasting hex addresses is error-prone and intimidating. A picker is dramatically better UX.

### 4.5 Highlight Connected User's Row
- **Priority**: P2
- **Files**: `src/pages/dao/Members.tsx` (`MemberRow`)
- **What**: Add a subtle left border accent or background tint to the row matching the connected wallet address. Use `primary-500/10` background or a `border-l-2 border-primary-500`.
- **Why**: Helps the member quickly find their own row in a long list.

---

## Tier 5: Treasury + Overview (1-2 days)

Make the numbers authoritative and the dashboard useful.

### 5.1 Larger Treasury Numbers
- **Priority**: P1
- **Files**: `src/pages/dao/Treasury.tsx`
- **What**:
  - Native QUAI balance: bump from `text-xl` to `text-3xl font-bold` with accent color
  - Guild token balances: bump from `text-sm` to `text-base` or `text-lg`
  - These are the most important numbers on the page — they should look like money, not metadata
- **Why**: Token balances at `text-sm` are the same visual weight as address metadata.

### 5.2 "Your Share" Card
- **Priority**: P1
- **Files**: `src/pages/dao/Treasury.tsx`
- **What**: For connected members, show a card next to the native balance: "Your proportional share: ~X.XX QUAI" calculated as `(memberShares / totalShares) * nativeBalance`. Also show the percentage.
- **Dependencies**: Needs `useMember` query for the connected user's shares + `dao.total_shares`.

### 5.3 Two-Column Overview Layout
- **Priority**: P1
- **Files**: `src/pages/dao/Overview.tsx`
- **What**: On desktop (`lg+`), place Treasury Summary and Recent Proposals side by side in a 2-column grid below the hero banner. Keep hero and announcement as full-width.
- **Why**: The current single-column stacked layout wastes horizontal space on desktop and makes the page feel long.

### 5.4 Replace Members Section with Quick Actions
- **Priority**: P2
- **Files**: `src/pages/dao/Overview.tsx`
- **What**: Remove the redundant Members section (just shows a count that DaoStats already displays). Replace with a "Proposals needing your vote" section for connected members, or a recent activity feed.
- **Why**: The Members section adds near-zero information.

### 5.5 % of TVL Column in Guild Token List
- **Priority**: P2
- **Files**: `src/pages/dao/Treasury.tsx`
- **What**: Add a "% of TVL" column showing each token's share of total treasury value. For V1, this can be relative to the number of tokens (since we don't have USD prices).
- **Note**: Without a price oracle, this could show the relative balance weight or just be deferred.

---

## Tier 5.5: Navigator Pages + Settings + Launch Wizard (1-2 days)

Pages omitted from the original audits, identified during plan review.

### 5.5.1 Navigator Pages (Navigators.tsx + NavigatorDetail.tsx)
- **Priority**: P1
- **Files**: `src/pages/dao/Navigators.tsx`, `src/pages/dao/NavigatorDetail.tsx`
- **What**:
  - Replace `<Loading fullPage />` with contextual skeleton loading
  - Fix Permission Locks card responsive layout (3-column grid compresses badly on narrow screens — use `grid-cols-1 sm:grid-cols-3`)
  - Extract Permission Locks card into a shared component (duplicated between Navigators and Settings pages)
  - Add pagination or "load more" to NavigatorDetail event history
  - Only show "Direct-send warning" for Onboarder-type navigators (currently shows for all types)
  - Move "Add Navigator" button to a more prominent position (currently below the list)
- **Consideration**: The navigator pages use the plugin system (OnboarderPlugin, ERC20TributePlugin). The plugin architecture is well-designed and should not be changed.

### 5.5.2 Settings Page (Settings.tsx)
- **Priority**: P2
- **Files**: `src/pages/dao/Settings.tsx`
- **What**:
  - Add a prominent CTA button linking to the Governance Config proposal type: "Propose Changes" → navigates to `/dao/:daoId/proposals/new?type=govconfig`
  - Use the shared Permission Locks component (from 5.5.1)
  - Add loading skeleton (currently relies entirely on parent DaoLayout's loading gate)

### 5.5.3 Launch Wizard Mobile + Validation UX
- **Priority**: P1
- **Files**: `src/components/launch/LaunchWizard.tsx`, `src/components/launch/steps/ReviewStep.tsx`
- **What**:
  - Show step labels on mobile (currently `hidden sm:block` — mobile users only see numbered circles)
  - Add visible validation feedback when `validateCurrentStep()` fails (currently the wizard silently refuses to advance)
  - Add confirmation dialog (using existing `ConfirmDialog` component) before the final deploy transaction in ReviewStep
  - Fix step indicator overflow on small screens (7 circles compress poorly — consider a compact `1/7` counter on mobile instead of the full circle row)
  - Fix "Resumed from your previous session" notice color for light mode
- **Why**: The launch wizard is the critical onboarding path for DAO creators. A DAO launch costs significant gas — the UX should prevent mistakes.

---

## Tier 6: Loading States + Design System (2-3 days)

Build the missing components that create a polished, consistent experience.

### 6.1 Skeleton Loader Component
- **Priority**: P1
- **Files**: New `src/components/common/Skeleton.tsx`
- **What**: A shimmer placeholder component using the existing `shimmer` animation defined (but unused) in `tailwind.config.js`. Props: `width`, `height`, `rounded`, `className`. Renders a `bg-dao-surface animate-shimmer` div with a gradient overlay.
- **Why**: Every loading state in the app is the same generic spinner. Skeleton loaders that match content shape improve perceived performance and prevent layout shift.

### 6.2 Page-Specific Skeleton Layouts
- **Priority**: P1
- **Files**: `src/pages/Explore.tsx`, `src/pages/dao/Overview.tsx`, `src/pages/dao/Proposals.tsx`, `src/pages/dao/Members.tsx`
- **What**: Replace `<Loading fullPage />` with contextual skeletons:
  - Explore: 6 DaoCard-shaped skeleton rectangles in the grid
  - Overview: Hero skeleton + 2 card skeletons
  - Proposals: 3-4 proposal card skeletons
  - Members: Table header + 5 row skeletons
- **Why**: A spinner creates a blank page flash. Skeletons maintain the layout shape.

### 6.3 SectionHeader Component
- **Priority**: P2
- **Files**: New `src/components/common/SectionHeader.tsx`, used in `Overview.tsx`, `Members.tsx`, `Treasury.tsx`
- **What**: A reusable component: `<SectionHeader title="Treasury" action={<Button>View Details</Button>} />`. Currently each page manually builds the same `flex items-center justify-between` + `h2` + action button pattern.
- **Why**: Standardizes section headers across all pages. Currently 5+ instances of the same pattern with slightly different styling.

### 6.4 ErrorBanner Component
- **Priority**: P2
- **Files**: New `src/components/common/ErrorBanner.tsx`, replace ad-hoc error displays across pages
- **What**: A reusable error display: `<ErrorBanner message="Failed to load" />`. Currently errors display as: `EmptyState` in some pages, custom `bg-red-50` divs in others, and inline `<p>` tags elsewhere.
- **Why**: Consistent error presentation across the app.

### 6.5 Explore Page Polish
- **Priority**: P2
- **Files**: `src/pages/Explore.tsx`
- **What**:
  - Add a magnifying glass icon inside the search input
  - Add a chevron icon to the sort dropdown (currently looks like a plain text input)
  - Add a "My DAOs" filter chip for connected users
  - Add pagination or "Load more" for the DAO grid
- **Why**: The search input has no visual affordance, the select doesn't look like a dropdown, and the page doesn't scale with many DAOs.

---

## Tier 7: Polish (ongoing)

Refinements that add delight. Ship incrementally as time allows.

### 7.1 Avatar Preview in Profile Form
- **Files**: `src/components/member/MemberProfileForm.tsx`
- **What**: Add a live preview thumbnail below the avatar URL input using `MemberAvatar` component
- **Effort**: Small

### 7.2 Confirmation Dialog Before Proposal Submission
- **Files**: `src/pages/dao/NewProposal.tsx` (integrate existing `ConfirmDialog`)
- **What**: Use the existing `ConfirmDialog` component to show a summary of all proposal actions before the final submit. Especially important for high-value funding proposals and multi-action custom proposals. The component already exists — just needs to be wired into the submission flow.
- **Effort**: Small-Medium

### 7.3 Number Count-Up Animation in DaoStats
- **Files**: `src/components/dao/DaoStats.tsx`, new `src/hooks/useCountUp.ts`
- **What**: Animate stat numbers counting up from 0 on first render using requestAnimationFrame
- **Effort**: Small

### 7.4 Status Badge Pulse for Active Voting
- **Files**: `src/components/common/StatusBadge.tsx`
- **What**: Add a subtle pulse animation to the "Voting" status badge to indicate time-sensitivity
- **Effort**: Small

### 7.5 Sidebar DAO Section Transition
- **Files**: `src/components/layout/Sidebar.tsx`
- **What**: The DAO nav section appears/disappears instantly when entering/leaving a DAO route. Add height + opacity transition for a smooth slide-in.
- **Effort**: Small

### 7.6 Toast/Notification Entrance Animation
- **Files**: `src/components/common/NotificationContainer.tsx`
- **What**: Slide-in from the right + fade on show, slide-out on dismiss
- **Effort**: Small

### 7.7 Result Summary in Processed/Defeated Banners
- **Files**: `src/pages/dao/ProposalDetail.tsx`
- **What**: Add "Passed 67% to 33% with quorum met" or "Defeated 30% to 70%" to the result banner text
- **Effort**: Small

---

## Design System Gaps Identified

Components that should exist but don't:

| Component | Purpose | Used by |
|-----------|---------|---------|
| `Skeleton` | Shimmer placeholder for loading states | All pages |
| `Breadcrumb` | Contextual navigation trail (Tier 1.6) | DaoLayout + all sub-pages |
| `SectionHeader` | Title + action button pattern | Overview, Members, Treasury |
| `ErrorBanner` | Consistent error display | All pages |
| `MemberPicker` | Searchable member dropdown | Delegation widget |
| `PermissionLocks` | Shared component (currently duplicated in Navigators + Settings) | Navigators, Settings |
| `Tooltip` | Hover info for truncated text, addresses, stats | Everywhere |
| `IconButton` | Icon-only button variant | Copy buttons, close buttons |
| `Badge` | Generic badge (unify StatusBadge, Member badge, etc.) | Status, roles, categories |

**Already exist** (incorrectly listed as missing in original audit):
- `Modal` — fully featured at `src/components/common/Modal.tsx` (focus trap, escape-key, backdrop click, aria)
- `ConfirmDialog` — wraps Modal at `src/components/common/ConfirmDialog.tsx` (danger/warning/info variants, loading state). Needs to be integrated into more flows (proposal submission, DAO launch) but does not need to be created.

Existing animations defined but unused in `tailwind.config.js`:
- `shimmer` — should be used for Skeleton component
- `glow-pulse` — could be used for active status indicators

Existing shadows defined but underused:
- `shadow-dao-card` — only used on hero section, should be available on all cards
- `shadow-dao-button` — defined but not applied to any buttons

---

## Implementation Notes

### Sequencing

Tiers are designed to be implemented in order, but are independent enough to skip or reorder:
- **Tier 1** has zero dependencies — pure CSS and config changes
- **Tier 2** is self-contained to ProposalDetail and new components
- **Tier 3** only touches proposal list and creation pages
- **Tier 4** only touches the Members page
- **Tier 5** touches Treasury and Overview
- **Tier 6** creates new shared components used across the app
- **Tier 7** items can ship anytime

### Risk Areas

- **Tier 2 (ProposalDetail two-column layout)** is the largest single change. The sticky sidebar needs to account for the Header height, mobile breakpoints, and the Suspense loading boundary. Test with proposals in every status (submitted, voting, grace, ready, processed, defeated, action-failed, expired, cancelled).
- **Tier 4.4 (MemberPicker)** requires a new component with combobox-like behavior (typing filters, arrow key navigation, selection). Consider using a headless UI library or keeping it simple with a filtered dropdown.
- **Tier 3.5 (form field reorder)** touches every proposal form. Needs systematic testing of all 8 proposal types end-to-end.

### Light Mode Verification

The app supports both light and dark modes via CSS custom properties. All tiers must be verified in both themes:
- Tier 1: Focus rings, shadows, and animations must look correct in both modes
- Tier 2: The VotingSidebar background/border must adapt to the theme
- Tier 4: Table header row styling must work in light mode
- The `dao-*` CSS variables resolve correctly in both themes via `:root` / `.dark` selectors in `index.css`

### What NOT to Change

- **DaoProfile component** — the hero banner is the strongest piece of UI in the app. Leave it alone.
- **RagequitModal** — already well-built with two-step flow, token selection, dust warnings. No changes needed.
- **The dark color palette** — the deep dark theme (`#0a0a12` bg) creates a premium feel. Don't lighten it.
- **Font choices** — Space Grotesk (display), Inter (body), JetBrains Mono (code) are excellent choices. Keep them.
- **Navigator plugin architecture** — the OnboarderPlugin/ERC20TributePlugin system is well-designed. Only modify the page shells, not the plugin internals.

---

## Estimated Total Effort

| Tier | Scope | Effort |
|------|-------|--------|
| 1 | Foundation (focus rings, shadows, animations, header, breadcrumb) | 1-2 days |
| 2 | Proposal Detail (two-column, sticky sidebar, mobile bar) | 2-3 days |
| 3 | Proposal List + Creation (badges, types, progress bar, grouping) | 1-2 days |
| 4 | Members Page (table header, search, mobile, picker) | 2-3 days |
| 5 | Treasury + Overview (numbers, your share, 2-col layout) | 1-2 days |
| 5.5 | Navigator Pages + Settings + Launch Wizard | 1-2 days |
| 6 | Loading States + Design System (skeleton, section header, errors) | 2-3 days |
| 7 | Polish (avatar preview, count-up, pulse, transitions) | Ongoing |
| **Total** | | **~14-20 days** |

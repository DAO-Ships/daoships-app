# Trust Architecture + Signal Navigator — App Refactor Plan

> **Update (2026-06-11): a THIRD trust class now exists.** This plan was written for the
> permissioned vs. **read-only** (Signal) split. The indexer has since shipped **BudgetNavigator**, a
> **module** class: no DAOShip permission and not read-only — its authority/trust is a **vault
> `EnabledModule` event** (derived from `ds_vault_module_events`), born `self_asserted` + `is_active=false`
> until enabled. Trust-gate it exactly like a read-only nav (`trust_status='sanctioned'`), just on a
> different sanction signal. The current canonical trust model is the three-class table in
> [`../FRONTEND_GUIDE.md` §8](../FRONTEND_GUIDE.md#8-navigator-system); the Budget feature plan is
> [`BUDGET_NAVIGATOR_SUPPORT.md`](BUDGET_NAVIGATOR_SUPPORT.md). This document stays as the Track-A/Track-B
> Signal-refactor record.

Sequenced implementation plan for syncing this app to the indexer's new navigator
**trust + lifecycle** model and shipping the read-only **SignalNavigator**.

Sources reviewed:
- `daoships-indexer/docs/NAVIGATOR_TRUST_ARCHITECTURE_PLAN.md` — the backend model (IMPLEMENTED 2026-06-08)
- `daoships-indexer/docs/FRONTEND_INTEGRATION.md` — the data-model contract (NavigatorRow fields, `ds_signal_polls`/`ds_signal_votes`, query patterns)
- `daoships-contracts/docs/{NAVIGATORS,INDEXER-GUIDE,POSTER}.md` — SignalNavigator + TimelockNavigator SHIPPED; `daoships.dao.navigators` poster tag
- `daoships-app/docs/SIGNAL_NAVIGATOR_SUPPORT.md` — the prior feature-level plan this sequences

## Decisions (locked 2026-06-08)
1. **Scope:** full — Track A (trust-model sync, all navigators) + Track B (Signal Navigator deploy/sanction/plugin/reads).
2. **Realtime:** polling for v1 — reuse the existing react-query 30s polling; no Supabase realtime hook yet.
3. **TimelockNavigator:** out of scope for *this* (trust + Signal) plan — stays `status:'planned'` here.
   **Update (2026-06-09):** the indexer has since shipped full Timelock **and** Vesting support, and both
   now have dedicated app guides — [`TIMELOCK_NAVIGATOR_SUPPORT.md`](TIMELOCK_NAVIGATOR_SUPPORT.md) and
   [`VESTING_NAVIGATOR_SUPPORT.md`](VESTING_NAVIGATOR_SUPPORT.md). They're separate efforts from this trust
   refactor (both permissioned → always `sanctioned`), tracked in those docs.

## Two framing facts
1. **The trust refactor touches every navigator type.** `NavigatorRow` gained `trust_status`,
   `permission_ever_granted`, `deploy_block`, and **`is_active` was redefined** to "functional now?"
   (read-only navs stay `is_active=true` at `permission=0`). Any code treating `is_active` as
   "has permission" is now wrong.
2. **Polls are invisible until the DAO sanctions the navigator.** `ds_signal_polls`/`ds_signal_votes`
   stay empty until a vault `daoships.dao.navigators` post endorses the nav (indexer then backfills).
   UI defaults to `trust_status='sanctioned'`-only with a "show unverified" toggle.

---

## Phase 0 — Assets & types (no behavior change)
- **0.1** `src/config/abi/SignalNavigator.json` (← contracts artifact `.abi`) + `src/config/abi/SignalNavigator.bytecode.ts` (creation bytecode + IPFS hash, mirror `OnboarderNavigator.bytecode.ts`).
- **0.2** `src/types/navigator.ts`: add `NavigatorTrustStatus` union; add `trust_status`, `permission_ever_granted`, `deploy_block?` to `Navigator`; add `SignalPollRow`, `SignalVoteRow`, `SignalPollStatus` (poll_id/weight/tally are **strings**).
- **0.3** `src/types/trust.ts`: `NAVIGATOR_TRUST_CONFIG` (label/color/show-policy) for the four statuses.

## Phase 1 — Track A: trust-model sync (cross-cutting)
- **1.1** `NavigatorIndexerService`: type widens via `select('*')`; add `listSanctionedNavigators(daoId, type?)`.
- **1.2** Audit every `is_active` read — replace any "has permission" inference with `permission > 0` / `permission_ever_granted`.
- **1.3** `NavigatorCard` / `NavigatorCatalog` / `NavigatorDetailCard`: default feed = sanctioned + permissioned; `self_asserted` read-only behind "show unverified" + badge; `unsanctioned`/`fabricated` hidden.

## Phase 2 — Track B: Signal deploy + catalog
- **2.1** `navigatorCatalog.ts`: SignalNavigator → `shipped` (copy from SIGNAL doc §0); update `navigatorCatalog.test.ts`.
- **2.2** `navigatorValidation.ts`: SignalNavigator branch (`minDuration>0`, `minDuration ≤ maxDuration ≤ MAX_WINDOW`, `maxStartDelay ≤ MAX_WINDOW`).
- **2.3** `NavigatorDeployService.ts`: SignalNavigator case, 7 ctor args, **no `setNavigators`**; keep verification loop.

## Phase 3 — Track B: sanction governance flow
- **3.1** `src/types/poster.ts`: `POSTER_TAGS.DAO_NAVIGATORS = 'daoships.dao.navigators'`.
- **3.2** `PosterService.ts`: `buildSanctionNavigatorsContent(daoAddress, navigators[])` (full-set, last-write-wins, lowercased).
- **3.3** Proposal builder: "Sanction signal navigators" action via `ProposalEncoder.addPosterPost`; pre-fill current sanctioned set + new address.

## Phase 4 — Track B: member plugin + reads
- **4.1** Rename `SignalForm.tsx` → `SignalProposalForm.tsx` (disambiguate from navigator polls).
- **4.2** `NavigatorIndexerService`: `listSignalPolls`, `getSignalPoll` (authoritative `tally`), `hasVoted`, `listPollVotes`. Polling, no realtime.
- **4.3** `useNavigatorConfig`: SignalNavigator branch (immutables + `pollCount`).
- **4.4** `SignalPlugin.tsx` + register; poll list (`computeSignalPollStatus`), create/vote/cancel writes with view preflight + error-copy map; results from `tally`; `self_asserted` empty-state CTA.

## Phase 5 — Verification
- Type-check, run tests (update catalog test). Manual round-trip: deploy → unverified → sanction proposal → polls surface → create/vote/cancel.

**Commit boundaries:** P0+P1 / P2 / P3 / P4 / P5.

---

## Status (implemented 2026-06-08)
All phases implemented. Automated verification green: `tsc` clean, `eslint` clean
(`--max-warnings 0`), 228/228 tests pass, `vite build` succeeds.

**Remaining (manual, needs funded Cyprus1 wallet + running indexer):** the live round-trip —
deploy a SignalNavigator → confirm it shows `self_asserted`/hidden → pass a `daoships.dao.navigators`
sanction proposal → confirm the indexer backfills + polls surface → create/vote/cancel.

Key artifacts added:
- ABI `src/config/abi/SignalNavigator.json` + bytecode (CIDv0 `QmQTefaaDcNXkZjjXGdt9czkZEjxZGjqvHuY95h1bHvJLF`).
- `NavigatorTrustStatus`/`SignalPollRow`/`SignalVoteRow`/`computeSignalPollStatus` in `types/navigator.ts`;
  `NAVIGATOR_TRUST_CONFIG`/`isNavigatorVisible` in `types/trust.ts`.
- Trust gating in `pages/dao/Navigators.tsx` + `NavigatorCard`/`NavigatorDetail`.
- Deploy: `NavigatorDeployService.deploySignalNavigator` + catalog form (no `setNavigators`).
- Sanction: `POSTER_TAGS.DAO_NAVIGATORS`, `PosterService.buildSanctionNavigatorsContent`,
  `ProposalType.NavigatorSanction` + `NavigatorSanctionForm` (full-set, pre-filled).
- Member: `SignalPlugin` + `useSignalPolls` (30s polling) + `NavigatorService` signal reads/writes +
  indexer reads in `NavigatorIndexerService`.
- Disambiguation: `SignalForm.tsx` → `SignalProposalForm.tsx`.

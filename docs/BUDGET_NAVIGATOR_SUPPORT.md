# Supporting the BudgetNavigator in the app

> **STATUS: IMPLEMENTED (Phase 1, 2026-06-11; catalog deploy added 2026-06-15).** The full
> read/display/manager surface, catalog **deploy** (§0), and the governance deep-links described below
> are in the codebase. Files:
> `src/types/budget.ts` (`BudgetRow`/`BudgetDisbursementRow`/`VaultModuleEventRow` +
> `computeBudgetStatus`/`ceilingRemaining`, tested in `src/types/__tests__/budgetStatus.test.ts`),
> `src/services/indexer/BudgetIndexerService.ts` (`ds_budgets`/`ds_budget_disbursements`/`ds_vault_module_events`),
> `src/services/core/NavigatorService.ts` (`BudgetNavigatorConfig`, detect, `getBudgetRemaining`,
> `isModuleEnabled`, `budgetDisburse`/`budgetDisburseBatch`/`budgetPause`/`budgetUnpause`),
> `src/hooks/useBudgets.ts`, `src/utils/budgetProposals.ts` (proposal-action encoders + deep-link
> builder + `resolvePrevModule`), `src/components/navigator/plugins/BudgetPlugin.tsx` (registered in
> `plugins/index.ts`). Governance actions deep-link into the custom-action proposal form via
> `customTo`/`customData`/… query params (`src/pages/dao/NewProposal.tsx` +
> `CustomActionForm` `prefillActions`). `NavigatorDetail` renders the plugin even when the module is
> not-yet-enabled (`is_active=false`) so the "enable treasury access" flow is reachable.
> Contract reference:
> `daoships-contracts/contracts/navigators/BudgetNavigator.sol` and
> `daoships-contracts/docs/BUDGET_NAVIGATOR.md` (canonical). Indexer data model:
> `daoships-indexer/docs/BUDGET_NAVIGATOR_SUPPORT.md`.

> **Model:** governance approves a recurring **budget** (a per-budget `manager`, a `token`, a
> per-period `allowancePerPeriod` that resets each period, and a lifetime `totalCeiling`). The manager
> then disburses treasury funds — `disburse(to, amount)` or `disburseBatch(to[], amounts[])` (payroll)
> — **without a proposal per payment**, bounded by those caps. It is **treasury-disbursement only**: it
> never mints (that is VestingNavigator).

> ### ⚠️ Read first — Budget's authority is a VAULT MODULE, not a DAOShip permission
> Unlike every other navigator, Budget holds **no** `setNavigators` permission. It moves treasury funds
> by being an **enabled Zodiac module on the DAO's vault**. Two consequences for the app:
> 1. **Wiring is `vault.enableModule(budgetNav)`, NOT `setNavigators`.** The DAO-creator/governance flow
>    must build a proposal that calls the **vault's** `enableModule` (§2), not DAOShip.
> 2. **Trust = "is it an enabled module on this DAO's vault."** The indexer derives
>    `trust_status`/`is_active` from the vault's `EnabledModule`/`DisabledModule` events. Only surface a
>    budget navigator (and its budgets) once it is an active module; a deployed-but-not-enabled instance
>    is powerless — show it as unverified or hide it.

---

## 0. Catalog entry + deploy (done)

`src/config/navigatorCatalog.ts` has `BudgetNavigator` at `status: 'shipped'`, `permission: 0`,
`permissionLabel: 'Vault Module'`, `pattern: 'treasury'`, with a `warningText` explaining the module
grant.

**Deploy (added 2026-06-15).** Budget is deployable from the catalog like Vesting — a **metadata-only**
constructor `(daoShip, name, description)`; it never mints, so it has **no caps / allowlist / expiry**.
Wiring:
- `src/config/abi/BudgetNavigator.bytecode.ts` — creation bytecode (copied from the contracts artifact);
  `BUDGET_IPFS_HASH` in `NavigatorDeployService` is the CID from its CBOR metadata appendix.
- `NavigatorDeployService.deployBudgetNavigator({ daoShipAddress, name, description })` — mirrors
  `deployVestingNavigator`, with post-deploy `navigatorType === 'BudgetNavigator'` + `daoShip` checks.
- `NavigatorCatalog.tsx` — `isBudget` branch: skips the membership "Advanced Settings"
  (caps/expiry/allowlist) and shows a treasury-module explainer instead; the post-deploy CTA builds the
  **enable-module** proposal (§2), not a `setNavigators` register.

**The full flow is two governance steps after deploy:** deploy the navigator → propose
`vault.enableModule(budgetNav)` to activate it on the vault (§2) → propose `createBudget(...)` per
budget (§3). It is powerless until enabled.

---

## 1. The big difference from other navigators — wiring is on the VAULT

| Navigator | Wire-up call | Target |
|---|---|---|
| Onboarder / Vesting / NFTGated | `setNavigators([nav],[2])` | DAOShip |
| Timelock | `setNavigators([nav],[4])` | DAOShip |
| Signal | Poster `daoships.dao.navigators` sanction | vault (Poster) |
| **Budget** | **`enableModule(budgetNav)`** | **the vault** |

All of these are still **governance proposals** executed by the vault — the difference is only the
target/calldata of the inner action.

---

## 2. DAO-creator / governance flow — enable the module

Build a proposal whose single MultiSend action calls the vault's `enableModule`:

```ts
import QuaiVaultAbi from '@/config/abi/QuaiVault.json'

const vault = new ethers.Interface(QuaiVaultAbi)
const enableData = vault.encodeFunctionData('enableModule', [budgetNavAddress])

// One MultiSend action: { to: vaultAddress, value: 0, data: enableData }
// Wrap with the same proposal-builder used elsewhere and submit via DAOShip.submitProposal.
```

The proposal batch runs in the vault's context, so the self-call to `enableModule` is authorized
(`msg.sender == vault`). **Do not** route this through `setNavigators` — Budget takes no DAOShip
permission.

To revoke, submit a proposal calling `vault.disableModule(prevModule, budgetNav)` (the nuclear kill
switch). ⚠️ `disableModule` is a Gnosis-Safe **linked-list** removal — you must pass the `prevModule`
that points at `budgetNav`. Resolve it from the vault before building the proposal:

```ts
const SENTINEL = '0x0000000000000000000000000000000000000001'
const [modules] = await vault.getModulesPaginated(SENTINEL, 50) // most-recent-first
const i = modules.findIndex((m) => m.toLowerCase() === budgetNav.toLowerCase())
const prevModule = i <= 0 ? SENTINEL : modules[i - 1]
// proposal action: vault.disableModule(prevModule, budgetNav)
```

The indexer records the `DisabledModule` event in `ds_vault_module_events` and re-derives the
navigator's `trust_status` → `unsanctioned` (its budgets drop out of default views).

---

## 3. Governance flow — create / update / cancel budgets

These are avatar-only on the navigator, so they go through proposals (inner action targets the
navigator, arrives as `msg.sender == vault == avatar`):

```ts
const budget = new ethers.Interface(BudgetNavigatorAbi)

// Create: token = ZeroAddress for native QUAI; periodLength >= 3600 (MIN_PERIOD); ceiling > 0.
budget.encodeFunctionData('createBudget',
  [manager, token, allowancePerPeriod, totalCeiling, periodLength, startTime /*0=now*/, endTime /*0=perpetual*/])

budget.encodeFunctionData('updateManager', [budgetId, newManager])  // swap the manager
budget.encodeFunctionData('cancelBudget',  [budgetId])              // irreversible; halts disbursement
```

Surface validation client-side to match the contract: `manager != 0`, `allowancePerPeriod > 0`,
`totalCeiling > 0`, `3600 <= periodLength <= 3650 days`, `endTime == 0 || endTime > start`.

---

## 4. Manager flow — disburse (no proposal needed)

The budget's `manager` (an EOA or a keeper/bot) calls the navigator directly — this is the whole
point (zero governance overhead per payment):

```ts
const nav = new ethers.Contract(budgetNavAddress, BudgetNavigatorAbi, signer) // signer == manager
await nav.disburse(budgetId, to, amount)
await nav.disburseBatch(budgetId, [a, b, c], [amtA, amtB, amtC]) // payroll, atomic
```

Pre-flight with the views so the UI can disable a too-large disburse before it reverts:
`remainingThisPeriod(budgetId)` (live, lazy-adjusted) and `remainingTotal(budgetId)`. Revert reasons to
surface: `AllowanceExceeded`, `CeilingExceeded`, `NotStarted`, `BudgetEnded`, `BudgetCancelled_`,
`IsPaused`, `NotEnabledModule` (the module was disabled — wiring is broken).

---

## 5. Display & emergency controls

- **Only show active modules.** Gate budget lists on the indexer's `trust_status='sanctioned'` /
  `is_active` (derived from the vault `EnabledModule`/`DisabledModule` feed). A `self_asserted` budget
  navigator can't move funds — badge it "unverified / not enabled" or hide it. Budgets are **deferred**
  (no `ds_budgets` rows) until the module is enabled, then **backfilled** — empty pre-enable is expected.
- **Per budget:** manager, token, `remainingThisPeriod` (with a reset countdown to the next period),
  `remainingTotal` vs `totalCeiling`, active window (`startsAt`/`endsAt`), and the disbursement feed
  (`ds_budget_disbursements`). Use the contract views for live `remaining`; the stored `total_spent`
  is the lifetime cumulative (derive-from-truth `SUM` of disbursements), not the per-period figure.
- **Module access timeline (`ds_vault_module_events`):** the audit trail behind `trust_status` — each
  row is a vault `EnabledModule`/`DisabledModule` (`enabled` bool, `block_number`). Render it as
  "treasury access granted / revoked" history; the latest row is what trust is derived from. This is
  how you "accurately know whether the budget module has been removed."
- **Emergency controls** (escalating): `pause()` (GOVERNOR navigator or avatar — **freezes all
  disbursement**, the fast brake) → `cancelBudget(id)` via proposal (surgical) → `vault.disableModule`
  via proposal (nuclear). Show `pause` prominently for treasury safety.
- **Warning copy:** "This navigator can move treasury funds (it is an enabled vault module). Spending
  is capped per budget by an allowance and a ceiling; a compromised manager is bounded to one period's
  allowance. Disable the module to fully revoke."

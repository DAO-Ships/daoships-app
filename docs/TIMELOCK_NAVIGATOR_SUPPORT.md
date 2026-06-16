# Supporting the TimelockNavigator in the app

> **STATUS: IMPLEMENTED (Phase 3, 2026-06-11).** Files: `navigatorCatalog.ts` (shipped, GOVERNOR=4),
> `abi/TimelockNavigator.json` + `.bytecode.ts` (CID `QmRHkRsWTP…`), `types/timelock.ts`
> (`TimelockChangeRow`/`GovernanceConfigHistoryRow`/`TimelockChangeStatus` + `computeTimelockStatus`,
> tested in `types/__tests__/timelockStatus.test.ts`), `services/indexer/TimelockIndexerService.ts`,
> `services/core/NavigatorService.ts` (`TimelockNavigatorConfig`, detect, `timelockIsExecutable`,
> `timelockExecuteChange`), `services/core/NavigatorDeployService.ts` (`deployTimelockNavigator`),
> `utils/navigatorValidation.ts` (`timelockNavigatorSchema` + `getTimelockWarnings`),
> `utils/timelockProposals.ts` (queue/cancel/emergencyCancelAll/pause encoders, reusing
> `encodeGovernanceConfig`), `hooks/useTimelockChanges.ts`, `components/navigator/plugins/TimelockPlugin.tsx`
> (registered) + a delay/expiry deploy form in `NavigatorCatalog.tsx`.
> **Governance routing**: `GovernanceForm` takes an `activeTimelock` prop and routes config changes through
> `queueChange` (with a "bypass" affordance); `NewProposal.handleGovernanceSubmit` detects an active
> sanctioned GOVERNOR timelock and queues via `addCustomAction` instead of direct `setGovernanceConfig`.
> **Bypass warning**: `components/dao/TimelockBypassWarning.tsx` (driven by
> `ds_governance_config_history.bypassed_timelock`) renders on the DAO Settings page.

How to wire DAO Ships' `TimelockNavigator` into this app — the **DAO-creator** flow (deploy + register as
GOVERNOR), the **governance** flow (queue / execute / cancel a config change), and the **bypass warning**
the indexer now powers. Contract reference:
`daoships-contracts/contracts/navigators/TimelockNavigator.sol` and
`daoships-contracts/docs/TIMELOCK_NAVIGATOR.md` (canonical). Indexer data model:
`daoships-indexer/docs/FRONTEND_INTEGRATION.md` (`TimelockChangeRow`, `GovernanceConfigHistoryRow`,
`computeTimelockStatus`, the bypass-detection query).

> **Model:** a `TimelockNavigator` wraps `DAOShip.setGovernanceConfig` behind a **mandatory delay**.
> Instead of a passed proposal changing governance params instantly, the proposal **queues** the change;
> it becomes executable only after `delay` seconds and stays executable for `expiryWindow` seconds. The
> delay is a **second ragequit window** for config changes — members who dislike a passed parameter change
> can exit before it takes effect. It is a **permissioned GOVERNOR (4)** navigator: registered via
> `setNavigators`, so it always indexes as `trust_status='sanctioned'` (no sanction step, unlike Signal).

> ### ⚠️ Read first — the timelock is ADVISORY, not enforced on-chain
> A proposal can **always bypass** the timelock by calling `setGovernanceConfig` directly via
> `executeAsGovernance`. The contract cannot prevent this; `lockGovernor()` does not close it. So "all
> config changes go through the timelock" is a **tooling + social** commitment, and it has two app
> responsibilities:
> 1. **Route** every governance-config change through the navigator's `queueChange` (§3), never a direct
>    `setGovernanceConfig` action — for timelock-enabled DAOs.
> 2. **Warn** whenever the indexer flags a change that bypassed the timelock (§5). This is the only thing
>    that makes the advisory guarantee real to members.

---

## 0. Fix the catalog entry first

`src/config/navigatorCatalog.ts` has `TimelockNavigator` at `status: 'planned'`. Flip it and align the
copy with the shipped contract:

```ts
{
  type: 'TimelockNavigator',
  name: 'Timelock Navigator',
  icon: NAVIGATOR_ICONS.clock,              // or an existing governance icon
  shortDescription: 'Delay governance-config changes',
  description: 'Queues setGovernanceConfig behind a mandatory delay — a second ragequit window for config changes',
  permission: 4,
  permissionLabel: 'GOVERNOR',
  pattern: 'governance',
  status: 'shipped',                        // was 'planned'
  features: [
    'Mandatory delay on governance-config changes',
    'Second ragequit window (members exit before it lands)',
    'Queued changes are visible and cancellable',
    'Permissionless execution once matured',
    'Emergency cancel-all + pause',
  ],
  warningText: 'Advisory, not enforced: a proposal can still bypass it via a direct config change. The app routes config changes through the timelock and warns on bypasses. Must hold GOVERNOR (4) — and be the only GOVERNOR navigator — for the guarantee to hold.',
},
```

Update `navigatorCatalog.test.ts` for the new `shipped` entry.

---

## 1. Add ABI + bytecode

Match the existing pattern in `src/config/abi/`:
- `src/config/abi/TimelockNavigator.json` — the `abi` array from
  `daoships-contracts/artifacts/contracts/navigators/TimelockNavigator.sol/TimelockNavigator.json`.
- `src/config/abi/TimelockNavigator.bytecode.ts` — creation bytecode, mirroring
  `OnboarderNavigator.bytecode.ts` (used by `NavigatorDeployService`).

---

## 2. DAO-creator flow — deploy, then register as GOVERNOR

### 2.1 Config + validation

Constructor args (exact order):

```
_daoShip, _delay, _expiryWindow, _name, _description
```

| Field | Notes / mirror the constructor reverts (fail fast → avoid `InvalidConfig`/`DelayTooShort`/`DelayTooLong`) |
|---|---|
| `delay` | seconds. `MIN_DELAY` = 10 min, `MAX_DELAY` = 30 days. **`MIN_DELAY` is a sanity floor, not protection** — for a real exit window pass **≥ `RECOMMENDED_DELAY` (2 days)** and **longer than the DAO's `grace_period`**. Warn in the form when `delay < 2 days` or `delay <= grace_period`. |
| `expiryWindow` | seconds. `MIN_EXPIRY` = 1 hour, `MAX_EXPIRY` = 3650 days. Should comfortably exceed operational latency (a few days) so a matured change isn't missed before it expires. |
| `name`, `description` | optional metadata (emitted in `NavigatorDeployed`). |

Add a `TimelockNavigator` branch in `src/utils/navigatorValidation.ts`:
`MIN_DELAY <= delay <= MAX_DELAY`, `MIN_EXPIRY <= expiryWindow <= MAX_EXPIRY`, plus the soft warnings
(`delay >= RECOMMENDED_DELAY`, `delay > grace_period`). The constructor makes **no call** to the DAO, so
it is safe to deploy against a predicted DAO address.

### 2.2 Deploy (`src/services/core/NavigatorDeployService.ts`)

Add a `TimelockNavigator` case: `quais.ContractFactory(abi, bytecode, signer).deploy(...)` with the 5
args above. Capture the address.

### 2.3 Register as GOVERNOR (governance action)

Unlike MANAGER navigators it needs **governor** powers to call `onlyGovernor setGovernanceConfig`.
Submit a `setNavigators([thisNav], [4])` proposal — reuse the existing navigator-registration proposal
flow, just with permission value `4` (GOVERNOR).

> **Operational invariant:** the enforced "navigator can only *queue*" guarantee holds **only if the
> timelock is the sole GOVERNOR navigator**. If the deploy UI lets a DAO add a second GOVERNOR navigator,
> surface a warning. The indexer marks the row `trust_status='sanctioned'` automatically on `NavigatorSet`
> — no sanction proposal needed (that flow is Signal-only).

---

## 3. Governance flow — route config changes through the timelock

This replaces the dapp's existing "change governance config" proposal action **for timelock-enabled DAOs**.
Instead of encoding a direct `DAOShip.setGovernanceConfig`, encode a call to the navigator's `queueChange`.

### 3.1 Queue (the proposal action)

```solidity
function queueChange(bytes calldata _governanceConfig) external returns (uint256 changeId); // avatar-only; reverts IsPaused
```

- `_governanceConfig` is the **same ABI-encoded config blob** the DAO's `setGovernanceConfig` takes — build
  it exactly as the current direct-change flow does, then wrap it in `queueChange` instead.
- Encode `TimelockNavigator.queueChange(config)` as a single-action proposal (target = navigator, value 0),
  via `ProposalEncoder`. On execution the navigator queues the change and emits `ChangeQueued` carrying the
  **full config bytes** (the only place they live on-chain).
- In the proposal builder, detect "this DAO has an active TimelockNavigator" and **steer the governance-config
  action to `queueChange`**; only fall back to a direct `setGovernanceConfig` action behind an explicit
  "bypass timelock" affordance that warns it will trip the bypass flag (§5).

### 3.2 Execute (permissionless crank)

Once `now >= executable_after`, anyone can execute. The dapp surfaces this as an "Execute change" button on
the queued-change card (no proposal needed):

```ts
// governance_config bytes come from the indexer row (see §4) — they MUST match the queued hash
await timelock.executeChange(changeId, governanceConfig)   // nonReentrant; reverts ChangeNotReady / ChangeExpired / ConfigHashMismatch
```

> **You must supply the exact `governance_config` bytes.** They aren't reconstructable from the hash — read
> `ds_timelock_changes.governance_config` (§4). Wrong bytes → `ConfigHashMismatch`.

### 3.3 Cancel

```ts
await timelock.cancelChange(changeId)     // avatar-only (via proposal): cancel a pending change
await timelock.emergencyCancelAll()       // GOVERNOR navigator OR avatar: cancel ALL pending + pause queueing
await timelock.pause() / timelock.unpause()  // block/allow NEW queues (does NOT stop execution of queued changes)
```

Preflight with views to disable buttons before a revert: `isExecutable(changeId)`, `paused()`,
`changeCount()`. Map the custom errors to copy:

| Error | UI message |
|---|---|
| `ChangeNotReady` | "This change is still in its delay window." |
| `ChangeExpired` | "This change's execution window has passed — it can only be cancelled now." |
| `ChangeAlreadyExecuted` | "This change was already executed." |
| `ChangeAlreadyCancelled` | "This change was cancelled." |
| `ConfigHashMismatch` | "Config bytes don't match the queued change." (you sent the wrong bytes) |
| `IsPaused` | "Queueing is paused on this timelock." |
| `ChangeDoesNotExist` | "No such change." |
| `NotAuthorized` | "Only the DAO (via proposal) can queue or cancel." |
| `DelayTooShort` / `DelayTooLong` | (deploy-form validation should prevent these) |

---

## 4. Reading from the indexer (`src/services/indexer/NavigatorIndexerService.ts`)

Add methods + mirror `TimelockChangeRow` / `GovernanceConfigHistoryRow` / `TimelockChangeStatus` from
`daoships-indexer/docs/FRONTEND_INTEGRATION.md` into `src/types/navigator.ts` (or a `types/timelock.ts`).

- `listTimelockChanges(daoId)` → `ds_timelock_changes` by `dao_id`, `block_number desc`.
- `getTimelockChange(navAddr, changeId)` → single row; read `governance_config` for the execute call.
- Realtime: subscribe to `ds_timelock_changes` (filter `dao_id`) for queue/execute/cancel; reuse the
  `useRealtime*` hook pattern.

**Status is partly time-derived** (`queued`/`executed`/`cancelled` are stored; `executable`/`expired` are
clock-derived). Compute it client-side exactly as the indexer doc's `computeTimelockStatus`:

```ts
function computeTimelockStatus(c, now = Math.floor(Date.now()/1000)) {
  if (c.status === 'executed') return 'executed'
  if (c.status === 'cancelled') return 'cancelled'
  if (now < c.executable_after) return 'queued'      // delay / second ragequit window
  if (now <= c.expires_at) return 'executable'       // crankable now
  return 'expired'
}
```

Surface a **countdown to `executable_after`** (frame it as the second ragequit window) and an "Execute"
CTA while `executable`.

---

## 5. Bypass warning (mandatory — this is what makes the timelock meaningful)

The indexer writes `ds_governance_config_history`, one row per `GovernanceConfigSet`, with a
`bypassed_timelock` boolean. `true` = the config changed **directly**, skipping an active timelock.

```ts
// NavigatorIndexerService (or a governance service)
async listBypassedConfigChanges(daoId: string) {
  // ds_governance_config_history where dao_id = daoId AND bypassed_timelock = true, block_number desc
}
```

- On the DAO governance page (and ideally a persistent banner), if any recent change is `bypassed_timelock`,
  show: **"A governance-config change bypassed this DAO's timelock"** with the tx and the new config diff.
- Treat it as a **trust signal**, not an error: the change is valid and applied; members should know it
  skipped the delay/exit window.
- The full new config is in the same row (`voting_period`, `grace_period`, `proposal_offering`,
  `quorum_percent`, `sponsor_threshold`, `min_retention_percent`, `default_expiry_window`) — render the diff
  against the prior config.

---

## 6. Checklist

- [ ] `navigatorCatalog.ts`: TimelockNavigator → `shipped` (GOVERNOR, advisory warning) + update `navigatorCatalog.test.ts`.
- [ ] `src/config/abi/TimelockNavigator.json` + `.bytecode.ts`.
- [ ] `navigatorValidation.ts` branch (delay/expiry bounds + soft warnings on `delay < 2d` / `delay <= grace_period`) + `NavigatorDeployService` case (5 args).
- [ ] Register as GOVERNOR (`setNavigators([nav],[4])`); warn on a second GOVERNOR navigator.
- [ ] Proposal builder: route governance-config changes through `queueChange` for timelock-enabled DAOs; gate any direct `setGovernanceConfig` behind an explicit "bypass" affordance.
- [ ] Queued-change UI: list / countdown to `executable_after` / permissionless `executeChange` (with `governance_config` bytes) / `cancelChange` / `emergencyCancelAll` / pause; custom-error copy.
- [ ] `NavigatorIndexerService` reads + `TimelockChangeRow`/`GovernanceConfigHistoryRow`/`TimelockChangeStatus` types + `computeTimelockStatus` + realtime.
- [ ] **Bypass warning** from `ds_governance_config_history.bypassed_timelock` (banner + config diff).

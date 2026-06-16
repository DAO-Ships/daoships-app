# Supporting the VestingNavigator in the app

> **STATUS: IMPLEMENTED (Phase 2, 2026-06-11).** Files: `src/config/navigatorCatalog.ts` (shipped),
> `src/config/abi/VestingNavigator.json` + `.bytecode.ts`, `src/types/vesting.ts`
> (`VestingScheduleRow`/`VestingClaimRow`/`VestingStatus` + `vestedAmount`/`computeVestingStatus`/`claimable`,
> tested in `src/types/__tests__/vestingStatus.test.ts`), `src/services/indexer/VestingIndexerService.ts`,
> `src/services/core/NavigatorService.ts` (`VestingNavigatorConfig`, detect, `getVestingClaimable`/`getVestingVested`/`getVestingSchedules`, `vestingClaim`),
> `src/services/core/NavigatorDeployService.ts` (`deployVestingNavigator`), `src/hooks/useVestingSchedules.ts`,
> `src/utils/vestingProposals.ts` (createSchedule/revoke/pause action encoders + deep-link),
> `src/components/navigator/plugins/VestingPlugin.tsx` (registered), and a metadata-only deploy form in
> `NavigatorCatalog.tsx`. Governance actions (create/revoke) deep-link into the custom-action proposal form;
> MANAGER registration deep-links into the navigator proposal form. Note: a NavigatorDeployService IPFS CID
> was extracted from the bundled bytecode's CBOR (`QmdSX6vuYL…`) — re-extract if the ABI is recompiled.

How to wire DAO Ships' `VestingNavigator` into this app — the **DAO-creator** flow (deploy + register as
MANAGER), the **governance** flow (create / revoke schedules via proposal), and the **beneficiary** flow
(claim vested tokens), plus the indexer reads behind it. Contract reference:
`daoships-contracts/contracts/navigators/VestingNavigator.sol` and
`daoships-contracts/docs/VESTING_NAVIGATOR.md` (canonical). Indexer data model:
`daoships-indexer/docs/FRONTEND_INTEGRATION.md` (`VestingScheduleRow`, `VestingClaimRow`, `VestingStatus`,
`vestedAmount`/`computeVestingStatus`/`claimable`).

> **Model:** a `VestingNavigator` mints shares **or** loot to a beneficiary on a **cliff + linear schedule**,
> minting *incrementally as tokens vest*. It is a **permissioned MANAGER (2)** navigator: registered via
> `setNavigators`, so it always indexes as `trust_status='sanctioned'` (no sanction step, unlike Signal).
> Schedules are created by governance (the avatar, via a passed proposal); the **beneficiary or governance**
> pulls vested tokens with `claim`.

> ### ⚠️ Two non-obvious things — read first
> 1. **There is no escrow. Vesting ≠ balance.** Unvested/unclaimed tokens **don't exist on-chain** — they
>    have no voting power, can't be ragequit, can't be transferred. Voting/economic weight activates **on
>    `claim`** (which mints). Always render real power from member balances (`ds_members`, fed by the token
>    `Transfer`), and use vesting rows only for *schedule/progress/claim* UI.
> 2. **The cliff is a delayed unlock of accrued-since-`startTime`, not "start accruing at the cliff."**
>    A 1-year cliff on a 4-year vest **unlocks 25% in a lump** the instant the cliff passes, then continues
>    linearly. Make this explicit in the schedule UI or users will misread the curve.

---

## 0. Fix the catalog entry first

`src/config/navigatorCatalog.ts` has `VestingNavigator` at `status: 'planned'`. Flip it:

```ts
{
  type: 'VestingNavigator',
  name: 'Vesting Navigator',
  icon: NAVIGATOR_ICONS.vesting,            // or an existing schedule/lock icon
  shortDescription: 'Vest shares or loot on a cliff + linear schedule',
  description: 'Mints shares or loot to a beneficiary as they vest — cliff + linear, claimed incrementally',
  permission: 2,
  permissionLabel: 'MANAGER',
  pattern: 'membership',
  status: 'shipped',                        // was 'planned'
  features: [
    'Cliff + linear vesting',
    'Shares OR loot per schedule',
    'Incremental minting on claim (no escrow)',
    'Beneficiary or governance can claim',
    'Non-destructive revoke (freezes accrual)',
  ],
  warningText: 'No escrow — unvested tokens carry no power until claimed. No global dilution cap: size totalAmount vs supply. Revoke freezes future accrual but does NOT claw back already-minted tokens. Must keep MANAGER (2) or claims fail.',
},
```

Update `navigatorCatalog.test.ts` for the new `shipped` entry.

---

## 1. Add ABI + bytecode

Match the existing pattern in `src/config/abi/`:
- `src/config/abi/VestingNavigator.json` — the `abi` array from
  `daoships-contracts/artifacts/contracts/navigators/VestingNavigator.sol/VestingNavigator.json`.
- `src/config/abi/VestingNavigator.bytecode.ts` — creation bytecode, mirroring
  `OnboarderNavigator.bytecode.ts` (used by `NavigatorDeployService`).

---

## 2. DAO-creator flow — deploy, then register as MANAGER

### 2.1 Config + validation

Constructor args (exact order) — minimal, since schedules are created later:

```
_daoShip, _name, _description
```

The constructor only stores `daoShip` and emits `NavigatorDeployed`; it makes **no call** to the DAO, so
it is safe to deploy against a predicted DAO address. Add a thin `VestingNavigator` branch in
`navigatorValidation.ts` (just non-empty `daoShip`; metadata optional).

### 2.2 Deploy (`src/services/core/NavigatorDeployService.ts`)

Add a `VestingNavigator` case: `quais.ContractFactory(abi, bytecode, signer).deploy(_daoShip, name, description)`.
Capture the address.

### 2.3 Register as MANAGER (governance action)

Submit a `setNavigators([thisNav], [2])` proposal (permission `2`, MANAGER) — reuse the existing
navigator-registration flow. The navigator can only mint (i.e. claims only work) once it's registered.

> **Revoking the MANAGER bit is a fail-closed kill switch** — it strands every beneficiary's unclaimed
> vested tokens until re-granted. Don't present "remove permission" as a soft pause; use `pause()` (blocks
> new schedules only) or per-schedule `revoke`. Surface this in the navigator-management UI.

---

## 3. Governance flow — create / revoke schedules (avatar-only, via proposal)

### 3.1 Create a schedule

```solidity
function createSchedule(
    address beneficiary, uint256 totalAmount, uint64 startTime,
    uint64 cliffDuration, uint64 vestingDuration, bool isLoot
) external returns (uint256 scheduleId);   // avatar-only; reverts IsPaused when paused
```

Encode as a proposal action (target = navigator, value 0) via `ProposalEncoder`; batch many grants in one
proposal via MultiSend. Form fields + the contract's validation (mirror to fail fast):

| Field | Notes / reverts |
|---|---|
| `beneficiary` | non-zero (`InvalidBeneficiary`). **Immutable** — lost keys can't be redirected later. |
| `totalAmount` | wei, **> 0** (`ZeroAmount`). 1e18 = 1 whole share/loot. |
| `startTime` | unix ts, or `0` = "now". **Back-dating is allowed and bypasses the cliff** — a past `startTime` can make a schedule immediately (partly/fully) claimable. Flag a back-dated `startTime` in the proposal-review UI. |
| `cliffDuration` | seconds; `<= vestingDuration` (`CliffExceedsVesting`). `0` = pure linear from start. `== vestingDuration` = pure 100%-at-end cliff. |
| `vestingDuration` | seconds, **> 0** (`InvalidConfig`). |
| `isLoot` | `false` = shares (dilutes votes on claim), `true` = loot (economic/ragequit only). One kind per schedule — to grant both, create two. |

> **No global dilution cap.** `totalAmount` per schedule is the only bound; N schedules of M each dilute by
> N×M with no contract ceiling. Show projected dilution vs current `total_shares`/`total_loot` at
> proposal-build time.

The contract emits `ScheduleCreated(scheduleId, beneficiary, totalAmount, startTime, cliffEnd, vestingEnd, isLoot)`
with **absolute** `cliffEnd`/`vestingEnd` (it resolves `startTime==0` to the creation block first).

### 3.2 Revoke a schedule

```ts
await vesting.revoke(scheduleId)   // avatar-only: freeze accrual at this block; non-destructive
```

**Non-destructive and timing-sensitive:** it freezes accrual at the current block; whatever vested up to
then stays claimable forever, and a beneficiary who claims right before a revoke keeps it. **True clawback
is a separate governance `burnShares`/`burnLoot` call** — make that distinction clear in the UI.

### 3.3 Pause

```ts
await vesting.pause() / vesting.unpause()   // GOVERNOR navigator OR avatar: blocks createSchedule only
```

`pause` does **not** stop existing claims or revokes. There is no global "freeze all claims" — to stop a
specific schedule, `revoke` it.

---

## 4. Beneficiary flow — claim vested tokens

```ts
await vesting.claim(scheduleId)   // beneficiary OR avatar; mints vested-but-unclaimed TO THE BENEFICIARY
```

- `claim` always mints to the **schedule's beneficiary**, regardless of caller (the avatar can force-distribute,
  but tokens never go to the caller).
- Preflight with views to disable the button before a revert: `claimable(scheduleId)` (0 → nothing to claim),
  `paused()` is irrelevant (claims work while paused). Reverts: `NothingToClaim`, `ScheduleDoesNotExist`.
- After a successful claim the minted tokens are **normal tokens** — transferable and **ragequit-able
  immediately** (vesting does not post-lock them). A share claim turns on voting power at that moment.

| Error | UI message |
|---|---|
| `NothingToClaim` | "Nothing has vested yet (or it's all been claimed)." |
| `ScheduleDoesNotExist` | "No such vesting schedule." |
| `AlreadyRevoked` | "This schedule was revoked." (on a revoke attempt) |
| `NotAuthorized` | "Only the beneficiary or the DAO can claim." |

> **Balances come from the token `Transfer`, not from `TokensClaimed`.** Each claim fires a
> `MintShares`/`MintLoot` + `Transfer` in the same tx; the indexer applies the `Transfer` to `ds_members`
> as usual. `ds_vesting_claims` is purely the activity feed — don't double-count it into balances.

---

## 5. Reading from the indexer (`src/services/indexer/NavigatorIndexerService.ts`)

Add methods + mirror `VestingScheduleRow` / `VestingClaimRow` / `VestingStatus` from
`daoships-indexer/docs/FRONTEND_INTEGRATION.md` into `src/types/navigator.ts` (or `types/vesting.ts`).

- `listVestingSchedules(daoId)` / `listVestingSchedulesForBeneficiary(daoId, beneficiary)` → `ds_vesting_schedules`.
- `getVestingSchedule(navAddr, scheduleId)` → single row.
- `listVestingClaims(navAddr, scheduleId)` → `ds_vesting_claims` by `schedule_pk` (the incremental mint feed).
- Realtime: subscribe to `ds_vesting_schedules` (filter `dao_id`) — its derived `claimed`/`updated_at`
  change on every claim and on revoke. **`ds_vesting_claims` is append-only and NOT in the realtime
  publication** — re-read the feed on demand instead.

**Status, `vested`, and `claimable` are time-derived** — never stored. Mirror the contract's `_vestedAmount`
(see the indexer doc for the exact helpers):

```ts
function vestedAmount(s, now = Math.floor(Date.now()/1000)) {
  const total = BigInt(s.total_amount)
  const end = s.revoked && s.revoked_at != null ? s.revoked_at : now
  if (end < s.cliff_end) return 0n
  if (end >= s.vesting_end) return total
  return (total * BigInt(end - s.start_time)) / BigInt(s.vesting_end - s.start_time)  // linear from start_time
}
function computeVestingStatus(s, now = Math.floor(Date.now()/1000)) {
  if (s.revoked) return 'revoked'
  if (now < s.cliff_end) return 'pending'
  if (now >= s.vesting_end) return 'fully_vested'
  return 'vesting'
}
// claimable = vestedAmount(now) - s.claimed   (clamp at 0)
```

`s.claimed` is the indexer's derive-from-truth `SUM(ds_vesting_claims.amount)` — authoritative for "how much
has been minted"; do **not** re-sum claims client-side or read on-chain balances for this.

---

## 6. Checklist

- [ ] `navigatorCatalog.ts`: VestingNavigator → `shipped` (MANAGER, no-escrow / no-cap / revoke≠clawback warning) + update `navigatorCatalog.test.ts`.
- [ ] `src/config/abi/VestingNavigator.json` + `.bytecode.ts`.
- [ ] `navigatorValidation.ts` branch + `NavigatorDeployService` case (3 ctor args).
- [ ] Register as MANAGER (`setNavigators([nav],[2])`); surface "revoking MANAGER strands claims" in nav-management UI.
- [ ] Proposal builder: `createSchedule` action (6 args, validation mirroring the reverts; dilution projection; back-dated-`startTime` flag) + `revoke` action; MultiSend for batch grants.
- [ ] Beneficiary claim UI: `claimable` preflight, `claim(scheduleId)`, custom-error copy, "claimed tokens are normal/ragequit-able" note.
- [ ] `NavigatorIndexerService` reads + `VestingScheduleRow`/`VestingClaimRow`/`VestingStatus` types + `vestedAmount`/`computeVestingStatus`/`claimable` + realtime on `ds_vesting_schedules`.
- [ ] Schedule UI explains the cliff (25%-at-cliff lump) and that vesting ≠ balance/power until claim.

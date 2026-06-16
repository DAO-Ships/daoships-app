# Supporting the SubscriptionNavigator in the app

> **STATUS: IMPLEMENTED (2026-06-12).** Files: `navigatorCatalog.ts` (shipped, MANAGER), `abi/SubscriptionNavigator.json` +
> `.bytecode.ts` (CID `QmPYtp…`), `types/subscription.ts` (3 row types + `computeSubscriptionStatus`,
> tested in `types/__tests__/subscriptionStatus.test.ts`), `services/indexer/SubscriptionIndexerService.ts`,
> `services/core/NavigatorService.ts` (`SubscriptionNavigatorConfig` + token-menu resolution, detect,
> `subscriptionQuote`/`subscriptionPaidThrough`/`subscriptionIsDelinquent`, `subscriptionPayFee`/`payFeeFor`
> [native exact-value + ERC-20 approve], `subscriptionCollectFee`), `services/core/NavigatorDeployService.ts`
> (`deploySubscriptionNavigator`, 11 args + per-token decimals resolution), `utils/navigatorValidation.ts`
> (`subscriptionNavigatorSchema`), `utils/subscriptionProposals.ts` (enroll/enrollBatch/pause/unpause/withdraw
> deep-links), `hooks/useSubscriptions.ts` + `useRealtimeSubscriptions.ts`,
> `components/navigator/plugins/SubscriptionPlugin.tsx` (registered) + a fee-menu deploy form in
> `NavigatorCatalog.tsx`. This is the 9th/final navigator — all 8 deployable navigators now have full UI.
>
> Original spec follows. Indexer data layer (tables `ds_subscription_members` / `ds_subscription_payments` /
> `ds_subscription_collections`, the `MemberEnrolled`/`FeePaid`/`FeeCollected` handlers, derived
> `total_paid`, and trust via the standard `NavigatorSet(nav,2) → sanctioned` path are all in place. See
> `daoships-indexer/docs/SUBSCRIPTION_NAVIGATOR_SUPPORT.md` and the **Subscription Queries** section of
> `daoships-indexer/docs/FRONTEND_INTEGRATION.md` for ready-to-use query patterns + row types. Contract
> reference: `daoships-contracts/contracts/navigators/SubscriptionNavigator.sol` and
> `daoships-contracts/docs/SUBSCRIPTION_NAVIGATOR.md` (canonical). ABI: `src/config/abi/SubscriptionNavigator.json`
> (landed). This is the **9th and final** navigator — the suite is complete.

> **Model:** recurring membership **dues**. Members **pull-pay** periodic fees (in a governance-set menu
> of native QUAI / ERC-20 tokens) straight to the **vault** to keep their membership `current`. Past a
> grace window a member is `delinquent` and **anyone** may `collectFee(member)` to remove their shares —
> **converted to loot** (default, non-destructive) or **burned** — earning a small loot keeper reward.

> ### Unlike Budget, this IS a standard DAOShip permission
> Subscription holds **MANAGER (2)**, registered the normal way via `setNavigators([nav], [2])` (route
> through `executeAsGovernance` in the proposal — `setNavigators` is `governanceOnly`). Trust = the
> standard `NavigatorSet(nav, 2)` → `sanctioned`. No vault module, no `enableModule`.

---

## 0. Catalog entry (done)

`src/config/navigatorCatalog.ts` — `SubscriptionNavigator` flipped to `status: 'shipped'`,
`permission: 2` / `MANAGER`, `pattern: 'recurring'`, with accurate features + a warning about
MANAGER scope, immutable config, and the sponsor-threshold collection edge.

---

## 1. Config detection (read once)

The whole config is immutable, so read it once at navigator-detail load:

```
periodDuration(), graceDuration(), startTime(), collectorRewardBps(), burnOnCollect()   // immutables
getAcceptedTokens() -> address[]            // address(0) = native QUAI
feePerPeriod(token) -> uint256              // per accepted token; 0 = not accepted
quote(periods, token) -> uint256            // total cost helper (reverts TokenNotAccepted)
```

Render the **fee menu** from `getAcceptedTokens()` + `feePerPeriod`. Label `address(0)` as native QUAI;
resolve ERC-20 symbols/decimals as elsewhere. Show period length, grace, keeper reward %, and the
enforcement mode (`burnOnCollect ? 'Shares burned' : 'Shares converted to loot'`).

---

## 2. Member view & status (per connected wallet)

From `ds_subscription_members` (or the views), compute status exactly like the contract — time-derived,
no event tells you a deadline passed. With `pt = paid_through`, `grace = graceDuration`:

| status | condition | UI |
|---|---|---|
| `not_enrolled` | `pt == 0` | "Not a subscriber" + a Subscribe CTA |
| `current` | `now <= pt` | green; countdown to `pt` (next due) |
| `grace` | `pt < now <= pt + grace` | amber; "Payment overdue — pay before {pt+grace} to avoid collection" |
| `delinquent` | `now > pt + grace` | red; "Collectible — pay now to stop a keeper removing your shares" |

`nextDeadline(member) == pt`. Reconcile exact membership via the `isCurrent`/`inGracePeriod`/
`isDelinquent`/`isEnrolled` views. `total_paid` (SUM-derived by the indexer) shows lifetime dues paid.

---

## 3. Member actions (write)

```
// pay your own dues — send native VALUE only when token == address(0)
payFee(periods, token)              { value: token == NATIVE ? feePerPeriod(token) * periods : 0 }
// gift/sponsor another member's dues (payer funds it)
payFeeFor(member, periods, token)   { value: ... same rule ... }
```

- **Native (QUAI):** `value` must equal `quote(periods, token)` **exactly** — the contract reverts
  `IncorrectPayment` on any mismatch (no change given). Compute it with `quote`; don't let the user overpay.
- **ERC-20:** standard approve → `payFee` (send **no** value; the ERC-20 path reverts on stray value).
  Surface the allowance step. Fee-on-transfer tokens revert `InsufficientPayment` — they won't be on a
  sane menu, but surface the error cleanly.
- Pre-payment and pay-for-another are first-class. After payment, `paid_through` jumps forward (debt
  model: a lapsed member's payment extends from where they were, so catching up may need several periods —
  show "you owe N periods to become current" using `pt`, `now`, `periodDuration`).

### Permissionless collection (keeper)

```
collectFee(member)   // anyone; only succeeds once isDelinquent(member)
```

Expose a "Collect lapsed members" view listing `delinquent` members (from the indexer) with their share
balance and the loot reward the caller would earn (`balance * collectorRewardBps / 10000`). Gotchas to
surface: a `delinquent` member with **0 shares** reverts `NoSharesToBurn` (nothing to collect); and
collection can revert if removing a **large** member would breach the DAO's `sponsorThreshold` — catch
it and show "can't collect: would drop shares below the sponsor threshold."

---

## 4. Governance actions (proposal deep-links)

Build custom-action proposals (same `customTo`/`customData` deep-link pattern as Budget):

| action | target | calldata |
|---|---|---|
| **Register** (one-time) | DAOShip | `executeAsGovernance(daoShip, 0, setNavigators([nav],[2]))` |
| **Enroll a member** | nav | `enroll(member)` — one complimentary period |
| **Enroll a batch** | nav | `enrollBatch(members[])` — skips already-enrolled |
| **Pause / Unpause** | nav | `pause()` / `unpause()` (also callable by a GOVERNOR navigator) |
| **Revoke** | DAOShip | `executeAsGovernance(daoShip, 0, setNavigators([nav],[0]))` |
| **Recover mis-sent ERC-20** | nav | `withdrawStuckTokens(token, to, amount)` |

`enroll` reverts `AlreadyEnrolled`; prefer `enrollBatch` for rosters (it skips overlaps silently). New
members don't need enrolling — their first `payFee` self-enrolls.

---

## 5. Display / trust notes

- **Trust is mandatory.** Dues and collection touch the cap table — default member/keeper views to
  `trust_status = 'sanctioned'` (a `NavigatorSet(nav,2)` was seen) and warn on anything else.
- **Immutable config.** There is no edit-fee/edit-menu flow — surface "change requires deploying a new
  Subscription navigator and re-registering."
- **Enforcement mode is fixed per deployment** — show whether lapsed members are converted-to-loot
  (they keep economic value, lose the vote) or burned, so members understand the stakes.
- **One complimentary period on enrollment** (governance-enrolled / initial members) — new self-payers
  get no free period (they paid). Reflect this so a freshly-enrolled member shows `current`, not overdue.

# Audit Remediation — Status

Tracks progress against `WEBAPP_AUDIT_2026-07.md` and `REMEDIATION_PLAN.md`.

**Branch:** `audit/remediation` · **PR:** https://github.com/DAO-Ships/daoships-app/pull/new/audit/remediation
**Baseline:** 343 tests, 51 tsc errors (build gate inert) → **now 412 tests, 0 tsc errors, CI enforcing**

---

## Done (14 commits)

| # | Commit | Package | Audit refs |
|---|---|---|---|
| 1 | `0ac4727` | CSP — WalletConnect `.org` relay, AppKit API, explorer, ipfs.io | S5 |
| 2 | `2fb2564` | Delete 23 unreferenced files (2,784 LOC) | SU1 |
| 3 | `0e9e1ec` | WP1 — `tsc -b`, all 51 errors cleared, CI added | ST7, ST6 |
| 4 | `8f36048` | WP2 — decoder anti-spoofing | S1, S2 |
| 5 | `71b00ee` | Mainnet — per-chain deployments, RPC shard path, `DAOShip` ABI sync | S6 |
| 6 | `554368d` | WP3 — real token decimals on write paths | ST1 |
| 7 | `526d6a9` | WP4 — fail loud instead of plausible empties | ST2, ST3, ST9, S4 |
| 8 | `666bd3f` | WP5 — governance parity with `DAOShip.sol` | ST4, ST8b, ST8e |
| 9 | `d6b7546` | WP6 — encoding / deep-link / allowlist validation | ST10, S7, S8 |
| 10 | `cf2e96c` | WP7 — startup failure page, `img-src` narrowed | ST13, S9 |
| 11 | `b14ddf1` | WP8 — `TxTracker`, launch recovery probe, `beforeunload` | ST5 |
| 12 | `a949951` | WP9 — pagination, narrowed proposal projection | SC1, SC2 |
| 13 | `246191c` | WP10 — modal focus, votes query key, wallet-cancel copy | ST12, ST13 |
| 14 | `01ad0d1` | Governance follow-ups | ST11, ST8a, ST8c, ST8d |

---

## Remaining

Ordered by materiality. Nothing below is known to lose funds; the fund-loss and
misinformed-consent items are all in the completed set.

### A. Partially-done packages

**WP4 — fail-loud reads.** The health gate, the three list reads with no on-chain
equivalent, ragequit and the ST9 fallbacks are done. Still swallowing errors: roughly
11 further `catch {}` sites in `DaoService` (records, budgets, subscriptions, vesting,
timelock reads). Same rule applies — a read helper may return empty only when it can
prove the source was consulted successfully.

**WP6 — validation.** `LaunchWizard`'s `useForm` still has **no zod resolver**;
`validateCurrentStep` case 1 is literally `return trigger('members')`. `shares`, `loot`,
`proposalOffering`, `sponsorThreshold`, `lootMultiplier`, `mintCap` and `perAddressCap`
remain unvalidated free text feeding strict `BigInt` calls, and the failure surfaces
*after* salt mining and after navigator deploys have been paid for. The schemas already
exist and are unit-tested in `navigatorValidation.ts` — `onboarderMultiplierSchema`,
`onboarderFixedPriceSchema`, `erc20TributeSchema` — and are imported by zero components,
while their signal/timelock/subscription siblings in the same file *are* wired in.
Also: `FundingForm.tsx:68` and `MembershipForm.tsx:92` use `Number(amount) <= 0`, which
lets `NaN` through (the keystroke filter admits `"."`, and `Number('.')` is `NaN`).
**Est. 1.5d.**

**WP8 — transaction durability.** `TxTracker` exists and the launch step probes for an
already-deployed DAO. Not yet wired: navigator post-deploy verification still discards
a paid-for address on a transient read failure; `submitProposal` has no duplicate
protection (a retry pays a second offering); ~35 `tx.wait()` calls still pass no
timeout. **Est. 2d.**

**WP9 — scale.** Proposals, DAOs and members are paginated. Still capped:
`RecordIndexerService`, `BudgetIndexerService`, `SubscriptionIndexerService`,
`VestingIndexerService`, `VoteIndexerService`. Also open: SC3 (N+1 provider calls with
no batching or windowing), SC4 (Merkle tree rebuilt three times per render), SC5
(`ds_indexer_state` refetches instead of using the pushed payload and is the only
realtime hook without a debounce), and raising the 10s proposal poll to 30s.
**Est. 3d.**

**WP10 — stability polish.** Modal focus, the votes query key and wallet-cancel copy
are done. Remaining from ST13:
- `ErrorBoundary` never resets (`hasError` clears only via `window.location.reload()`)
  and sits *inside* `Layout`, so sidebar links change the URL while the fallback
  persists, and a throw in `Header`/`ConnectModal` white-screens. 12 `React.lazy` routes
  have no chunk-load retry under `immutable, max-age=31536000`, so a redeploy strands
  open tabs.
- `SaltMiner.cancel()` terminates the worker without settling the `mineAllSalts`
  promise, so `await mine(...)` hangs and `finally { setMining(false) }` never runs.
  (Recoverable in-session via the wizard's Back button, which is why this is not
  higher.)
- `NavigatorService.detectAndLoadConfig` turns every failure into a *resolved*
  `{type:'unknown'}` that React Query caches as success for 5 minutes and that shadows
  the correct indexer type; nothing invalidates on `setSigner`.
- 9 `hasProvider()` sites read a module singleton non-reactively; needs a
  `providerReady` flag in `walletStore`.
- `useLaunchCost` treats `{gasPrice: null, balance: null}` as a successful query, so
  the affordability gate is bypassed for ~30s after connect.
- `useHasVoted` has no `refetchInterval` and resolves `false` (not an error) while
  un-indexed, so with >4s lag the Vote buttons re-enable.
- Vault owners are auto-populated with no duplicate check (`QuaiVault` reverts
  `DuplicateOwner`); `MAX_OWNERS` is in the ABI and never read.
- "Cancel Proposal" is a terminal on-chain action with no confirmation, while the
  *less* destructive submit path uses `ConfirmDialog`.
- `ProposalSettingsFields` placeholder suggests `"2 weeks"`, a unit
  `parseDurationToSeconds` does not support; it returns null and is mapped to 0 (the
  contract's use-default sentinel) with no error shown.
**Est. 3d.**

### B. Not started

**S9 security batch (low).** Bidi/homograph stripping in `SafeMarkdown` (U+202E and
Cyrillic homographs pass through as both href and label); `proposal_data` never checked
against `proposal_data_hash`; allowlist lookup starvable via `.limit(20)` with the
navigator filter applied client-side; `approve()` broadcast before `onboard` is
simulated, leaving a standing allowance with no revoke path; unbounded IPFS body
(`content-length` guard skipped when absent, fallback runs *after* `response.text()`);
lazy-loaded pipeline state `JSON.parse`d with no account/chain binding; `sanitize.ts`
has zero production wiring though two docs assert it as an active control — wire it or
delete it. **Est. 2d.**

**Efficiency (E1-E3).** WalletConnect + AppKit still load on every page view
(`core-*.js` 578k + `w3m-modal-*.js` 166k). It fires at module-eval via
`connector.setup?.()`, before React mounts, regardless of `reconnectOnMount`.
**This is an open product decision — see below.** Also: all 8 navigator bytecodes
(101 KB hex) sit in one chunk that `/launch` statically imports for 2 of them; plus a
render-waste batch (duplicate `NotificationContainer`, `VotingSidebar` memo + dual
mount, whole-store zustand selectors, `usePageVisibility` singleton).
**Est. 2.5d.**

**Succinctness (SU2-SU4).** 9 realtime hooks are one 40-line body copy-pasted and have
already drifted → extract `useRealtimeTable`. `NavigatorService` is 1,289 lines and
`DaoService` 1,160 → per-type adapters and a descriptor-table deploy service. Duplicated
logic across the `*Proposals.ts` builders and the 11 near-identical indexer services.
**Est. 7d.** Quality, not correctness — do last.

**Testing debt.** 412 tests now, but still zero for the indexer services and most of the
55 hooks. Each package above should add tests for what it touches rather than running a
separate testing project.

---

## Open decision

**WalletConnect: keep or drop?** The CSP fix (commit 1) makes it functional again. It
costs ~1 MB / 457 KB gzip on every page view. Dropping the connector reclaims that and
closes E1 outright, leaving Pelagus/injected as the only path. Both are under an hour;
they point opposite ways. It is a product call about which wallets you intend to
support, not an engineering one.

---

## Behaviour changes shipped (worth watching after deploy)

- `willProposalPass` **throws** rather than evaluating quorum against an absent
  snapshot. Both call sites handle it.
- `deriveProposalStatus` now returns **`Defeated`** for failed proposals past grace,
  matching `state()`. Members of the live DAO will see proposals relabelled from
  "Ready" to "Defeated" — correct, but visible.
- Ragequit is **blocked** while the guild-token list is loading or failed.
- Deep-link `customValue` and `customSummary` are no longer read from the URL.
- Governance form submits the exact on-chain value for untouched fields.

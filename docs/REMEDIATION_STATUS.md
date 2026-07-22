# Audit Remediation — Status

Tracks progress against `WEBAPP_AUDIT_2026-07.md` and `REMEDIATION_PLAN.md`.

**Branch:** `audit/remediation` · **PR:** https://github.com/DAO-Ships/daoships-app/pull/new/audit/remediation
**Baseline:** 343 tests, 51 tsc errors (build gate inert) → **now 412 tests, 0 tsc errors, CI enforcing**

## Decisions

- **WalletConnect: KEEP.** The CSP fix (`0ac4727`) restored the relay. Accepted cost:
  ~1 MB / 457 KB gzip on every page view, loaded at module-eval via
  `connector.setup?.()` before React mounts. E1 is therefore **closed as accepted**,
  not outstanding. Chunk-splitting (E2) remains available if load time becomes a
  concern.

---

## Done (15 commits)

| # | Commit | Package | Audit refs |
|---|---|---|---|
| 1 | `0ac4727` | CSP — WalletConnect `.org` relay, AppKit API, explorer, ipfs.io | S5 |
| 2 | `2fb2564` | Delete 23 unreferenced files (2,784 LOC) | SU1 |
| 3 | `0e9e1ec` | WP1 — `tsc -b`, all 51 errors cleared, CI added | ST7, ST6 |
| 4 | `8f36048` | WP2 — decoder anti-spoofing | S1, S2 |
| 5 | `71b00ee` | Mainnet — per-chain deployments, RPC shard path, ABI sync | S6 |
| 6 | `554368d` | WP3 — real token decimals on write paths | ST1 |
| 7 | `526d6a9` | WP4 — fail loud instead of plausible empties | ST2, ST3, ST9, S4 |
| 8 | `666bd3f` | WP5 — governance parity with `DAOShip.sol` | ST4, ST8b, ST8e |
| 9 | `d6b7546` | WP6 — encoding / deep-link / allowlist validation | ST10, S7, S8 |
| 10 | `cf2e96c` | WP7 — startup failure page, `img-src` narrowed | ST13, S9 |
| 11 | `b14ddf1` | WP8 — `TxTracker`, launch recovery probe, `beforeunload` | ST5 |
| 12 | `a949951` | WP9 — pagination, narrowed proposal projection | SC1, SC2 |
| 13 | `246191c` | WP10 — modal focus, votes query key, wallet-cancel copy | ST12, ST13 |
| 14 | `01ad0d1` | Governance follow-ups | ST11, ST8a, ST8c, ST8d |
| 15 | `cb98582` | This status document | — |

---

# Remaining work — re-audited and re-prioritised

Every item below was **re-verified against the current code**, because several original
audit claims proved overstated earlier in this effort. Verification notes are inline.
Priorities reflect verified impact, not the audit's original severity labels.

## P1 — Spends real money before failing · ~2 days

These are the only remaining items where a user loses funds or gas. All three were
confirmed by reading the code and, where possible, executing the failure.

### P1.1 · Launch wizard fields have no validation rules at all
`LaunchWizard.tsx:237-244` · `GovernanceStep.tsx:56-57` · `MembersStep.tsx:73,90`

`validateCurrentStep` *does* call `trigger()` on the governance and member fields — but
`proposalOffering` and `sponsorThreshold` are `useController({ control, name })` with
**no `rules`**, and `members.${i}.shares` / `.loot` are `control.register(...)` with none
either. `trigger()` on a field with no rules is a no-op, so these are unvalidated free
text feeding strict `BigInt` calls.

Executed against the real parser:

| input | result |
|---|---|
| `"1,000"` | **throws** `Cannot convert 1,000000000000000000000 to a BigInt` |
| `"abc"` | **throws** |
| `"1e3"` | **throws** |
| `"0.0000000000000000001"` | silently `0n` — **a founding member minted zero shares** |
| `"  "` | silently `0n` |

The throw surfaces as a raw engine message in a pipeline step **after** salt mining and
**after** navigator deploys have been paid for. The silent-zero case is worse: it
succeeds and produces a DAO with a member who holds nothing.

*Correction to the original audit:* it claimed voting period, grace period, quorum and
min-retention were also unvalidated. They are **not** — those have `rules` and validate
correctly. The gap is exactly the four fields above.

**Fix:** add `rules: { validate }` with `/^\d+(\.\d{1,18})?$/` to those four
registrations. The `navigatorValidation.ts` schemas
(`onboarderMultiplierSchema`, `onboarderFixedPriceSchema`, `erc20TributeSchema`) are
already written and unit-tested and imported by **zero** components, while their
signal/timelock/subscription siblings in the same file *are* wired in — wire step 3 to
them. **~1d.**

### P1.2 · Navigator deploy discards a paid-for address on a transient read
`NavigatorDeployService.ts:232-243` (and the sibling deploy methods)

Post-deploy verification reads `navigatorType()` and `daoShip()` **unguarded** after
`waitForDeployment()`. A transient RPC error is indistinguishable from a genuine type
mismatch: the method throws and `address` — the only record of a ~1.4M-gas contract —
is discarded. Retry deploys a duplicate and orphans the first, whose allowlist Poster
post never ran.

**Fix:** wrap verification and return `{ address, verified }` so a read failure never
loses the address. `TxTracker` (already landed) provides the persistence. **~0.5d.**

### P1.3 · Affordability gate is bypassed while balance is unknown
`useLaunchCost.ts:144`

```ts
const insufficient = requiredBalance != null && balance != null && balance < requiredBalance
```

When `balance` is `null` — which it is for ~30s after connect, because the query
resolves successfully with `{gasPrice: null, balance: null}` before the provider
exists — `insufficient` evaluates **false** and the gate opens. The user can start a
3-4 transaction paid pipeline they cannot afford, failing partway through.

**Fix:** treat unknown cost as blocking, not affordable. **~0.5d.**

---

## P2 — Wrong or missing information at a decision point · ~2.5 days

No direct fund loss, but each one misinforms a user or hides a failure.

### P2.1 · Terminal "Cancel Proposal" has no confirmation
`ProposalDetail.tsx:429,464` — `onCancel={() => actions.cancel()}` goes straight to the
wallet. `ConfirmDialog` exists and is used for the *less* destructive submit path
(`NewProposal.tsx:831`). **~0.25d.**

### P2.2 · Navigator config failure is cached as a successful "unknown"
`NavigatorService.ts:279-281` — a bare `catch { return { type: 'unknown', config: null } }`
returns a **resolved** value, so React Query caches it as success for 5 minutes. The
dominant trigger is a disconnected wallet. `NavigatorDetail.tsx:103`
(`configResult?.type || navigator.navigator_type`) then shadows the correct indexer type
and renders `UnknownPlugin` — "not yet supported" — above a Type field reading
`BudgetNavigator`. Nothing invalidates on `setSigner`. **~0.5d.**

### P2.3 · ErrorBoundary cannot recover and does not cover the shell
`App.tsx:34-57` · `ErrorBoundary.tsx:32`

Verified: the boundary sits **inside** `<Layout>` wrapping only `<Routes>`, so a throw in
`Header`, `Sidebar` or `ConnectModal` white-screens. `hasError` clears only via
`window.location.reload()`, so sidebar navigation changes the URL while the fallback
persists. Compounded by 12 `React.lazy` routes with no chunk-load retry under
`immutable, max-age=31536000` — a redeploy strands open tabs. **~1d.**

### P2.4 · Expiration placeholder advertises a unit the parser rejects
`ProposalSettingsFields.tsx:70` says `'None (e.g. "7 days", "2 weeks")'`. Verified:
`parseDurationToSeconds` matches only `days|hours|hrs|minutes|mins|seconds|secs|s|m|h|d`
— **no week unit**. It returns `null`, which `NewProposal.tsx:294-299` maps to `0`, the
contract's *use-default* sentinel, with no error rendered. A user asking for a 2-week
expiration silently gets the DAO default. **~0.25d.**

### P2.5 · `proposal_data` is never checked against `proposal_data_hash`
Verified: the field is selected and carried, and `keccak256` is never computed over
proposal data anywhere in `src/`. Cheap defense-in-depth against a compromised or
buggy indexer serving action bytes that do not match the on-chain commitment — refuse
to render or submit on mismatch. **~0.5d.**

---

## P3 — Silent truncation · ~1.5 days

Rows past a cap do not exist as far as the UI is concerned, with no indicator.

- **`RecordIndexerService.getMemberProfiles` `.limit(200)`** — returns the profile map
  used to render member identities. A DAO with >200 members silently loses names and
  avatars for the remainder. Highest-impact of this group.
- **`BudgetIndexerService.listDisbursementsByNavigator` `.limit(200)`** and
  **`VestingIndexerService.listClaimsByNavigator` `.limit(200)`** — single queries
  grouped client-side per card, so older budgets/schedules silently show empty history.
- **`RecordIndexerService` allowlist lookup `.limit(20)`** with the navigator filter
  applied **client-side after** — 20+ allowlist posts for a DAO evict the real record,
  and `staleTime: Infinity` makes it stick. Filter server-side on
  `content_json->>navigatorAddress`.

`fetchAllPages` (already landed in `a949951`) is the mechanism; this is applying it.

**Explicitly NOT truncation:** `SubscriptionIndexerService.listPayments` `.limit(25)`
and the other `.limit(25)` calls are deliberately bounded "recent activity" feeds for a
single member. Leave them.

---

## P4 — Robustness hygiene · ~3 days

Real but individually low-impact; batch them.

- **18 `catch {}` remain in `DaoService`.** ~7 correctly fall through to an on-chain
  read (fine). The rest still convert failure into a legitimate-looking empty.
- **36 `tx.wait()` calls with no timeout** — a stalled confirmation hangs the UI
  indefinitely.
- **19 `hasProvider()` sites read a module singleton non-reactively** — worse than the
  audit's stated 9. Needs a `providerReady` flag in `walletStore`.
- **`useHasVoted` never repairs** — no `refetchInterval`, resolves `false` (not an
  error) while un-indexed, so with >4s indexer lag the Vote buttons re-enable.
- **`SaltMiner.cancel()` never settles the promise** — verified: it posts `cancel` then
  calls `cleanup()` → `worker.terminate()`, which fires neither `onmessage` nor
  `onerror`, so `await mineAllSalts(...)` hangs forever and `finally { setMining(false) }`
  never runs. Recoverable in-session via the wizard's Back button, which is why this is
  P4 and not P1.
- **Vault owners auto-populated with no duplicate check** — `QuaiVault` reverts
  `DuplicateOwner`; `MAX_OWNERS` is in the ABI and never read.
- **`approve()` broadcast before `onboard` is simulated** (`NavigatorService.ts:498-508`)
  — verified: two `approve` calls awaited, then `onboard` sent with no `staticCall`
  dry-run. Any revert leaves a standing allowance with no revoke path in the UI.
- **Unbounded IPFS body** — the `content-length` guard is skipped when the header is
  absent, and the fallback size check runs *after* `response.text()` has buffered
  everything.
- **Lazy-loaded pipeline state unvalidated** — `ReviewStep` `JSON.parse`s a global
  localStorage key with no account/chain binding, feeding `MANAGER_PERMISSION` navigator
  addresses. `LaunchWizard` zod-validates its own blob; this one does not.
- **Bidi/homograph passthrough in `SafeMarkdown`** — the matched substring is both
  `href` and visible label; U+202E and Cyrillic homographs are unmodified.

---

## P5 — Downgraded or closed

Re-verification says these do not warrant scheduling.

| Item | Disposition |
|---|---|
| `sanitize.ts` has zero importers | **Downgraded to docs accuracy.** Verified `dangerouslySetInnerHTML` count is **0**, so there is no live XSS surface for it to guard. Two docs assert it as an active control — either wire it or delete it and correct the docs. Not a vulnerability. |
| E1 — WalletConnect bundle weight | **Closed as accepted** (see Decisions). |
| E2 — 101 KB of navigator bytecode in one chunk | Verified 101,543 bytes across 8 files, all statically imported by `NavigatorDeployService`. Real, but a lazy-import refactor with no correctness impact. Do opportunistically. |
| E3 — render waste | Duplicate `NotificationContainer`, whole-store zustand selectors, `usePageVisibility` singleton. No user-visible impact at current scale. |
| SU2 — 9 duplicated realtime hooks | Pure refactor. Worth doing when one of them next needs changing, not as a project. |
| SU3/SU4 — `NavigatorService` 1,289 lines, `DaoService` 1,160 | Pure refactor, ~7d. Highest-risk change in the backlog with the lowest user-visible return. **Do last, if at all.** |

---

## Suggested sequence

1. **P1** (~2d) — the only remaining items that cost users money.
2. **P2** (~2.5d) — misinformation at decision points.
3. **P3** (~1.5d) — silent truncation; mechanism already exists.
4. **P4** (~3d) — batch the hygiene items.
5. **P5** — opportunistic only.

**~9 days to clear P1-P4.** Down from the ~12 previously estimated, because
re-verification closed E1, downgraded `sanitize.ts`, and found several `.limit(25)`
caps to be deliberate rather than defects.

---

## Behaviour changes shipped (worth watching after deploy)

- `willProposalPass` **throws** rather than evaluating quorum against an absent
  snapshot. Both call sites handle it.
- `deriveProposalStatus` now returns **`Defeated`** for failed proposals past grace,
  matching `state()`. Members of the live DAO will see proposals relabelled from
  "Ready" to "Defeated" — correct, but visible.
- Ragequit is **blocked** while the guild-token list is loading or failed, and capped
  at the DAO's retention floor.
- Deep-link `customValue` and `customSummary` are no longer read from the URL.
- Governance form submits the exact on-chain value for untouched fields.
- Vote buttons are hidden for wallets with no voting power at the snapshot.

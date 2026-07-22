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

# P1-P4 — COMPLETE

All four priority bands are landed. Every item was re-verified against the code before
being fixed, and several original audit claims were corrected in the process (see the
re-audit commit `5ac97cc`).

| Band | Commit | Contents |
|---|---|---|
| P1 | `22bfb40` | Wizard field validation, navigator deploy address preservation, affordability gate |
| P2 | `a727a9f` | Cancel confirmation, config cache, ErrorBoundary, week unit, proposal-data hash |
| P3 | `45592f1` | Member-profile / budget / vesting pagination, allowlist starvation |
| P4 | `54dba52`, `b9d35ae` | Reactive provider state, salt-mining cancel, hasVoted repair, vault-owner dedupe, approve dry-run, bidi stripping, IPFS bounds, pipeline-state validation |

**452 tests · 0 type errors · lint clean · build green.**

## Deliberately NOT done in P4

Two items from the P4 list were assessed and left:

- **36 `tx.wait()` calls without a timeout.** Wiring a timeout through every call site is
  a wide, mechanical change with real regression risk (a too-short timeout turns a slow
  confirmation into a false failure, which is worse than the current hang). `TxTracker`
  already records the hash before the await, so a hung wait is now *recoverable* rather
  than *destructive* — the sharper edge is gone. Do this alongside the
  `DaoService`/`NavigatorService` decomposition, where the call sites get touched anyway.

- **The remaining `catch {}` blocks in `DaoService`.** Of 18, roughly 7 correctly fall
  through to an on-chain read and are fine as written. The rest cover records, budgets,
  subscriptions, vesting and timelock reads — all lower-consequence than the ragequit
  and navigator paths already fixed in `526d6a9`. Worth finishing, but no longer in the
  class of "a failure looks like a legitimate answer at a decision point".

---

# P5 — remaining backlog

Unchanged from the re-audit. Ready to revisit.

| Item | Est. | Notes |
|---|---|---|
| E2 — 101 KB navigator bytecode in one eagerly-imported chunk | 1d | All 8 blobs statically imported by `NavigatorDeployService`; `/launch` needs 2. Lazy-import refactor, no correctness impact. |
| E3 — render waste | 1.5d | Duplicate `NotificationContainer`, whole-store zustand selectors, `usePageVisibility` singleton, `VotingSidebar` dual mount. No user-visible impact at current scale. |
| SU2 — 9 duplicated realtime hooks | 1d | One 40-line body copy-pasted; already drifted once (the `['votes']` key bug). Extract `useRealtimeTable`. |
| SU3/SU4 — `NavigatorService` 1,289 lines, `DaoService` 1,160 | 7d | Per-type adapters, descriptor-table deploy service, `indexerQuery()` helper. Highest-risk change in the backlog with the lowest user-visible return. |
| Testing debt | ongoing | 452 tests now, but still zero for most of the 55 hooks and the indexer services. Better added alongside the next change to each area than as a project. |
| E1 — WalletConnect bundle weight | — | **Closed as accepted.** |

**Recommendation:** SU2 is the only P5 item with a correctness argument behind it — the
duplication has already produced one real bug. E2 is cheap and safe. SU3/SU4 should wait
for a reason beyond tidiness.

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

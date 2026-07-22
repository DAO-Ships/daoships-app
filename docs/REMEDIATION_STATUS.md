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

**486 tests · 0 type errors · lint clean · build green.**

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

# P5 — measured and re-scoped

Measured against the built output rather than inherited from the audit.

## Done

| Item | Commit | Outcome |
|---|---|---|
| SU2 — 9 duplicated realtime hooks | `8effeec` | Extracted `useRealtimeTable`. 413 → 245 lines. The duplication had already produced two real bugs (only 4 of 9 debounced; `useRealtimeVotes` invalidated an unregistered key, leaving the channel inert) — both are now structurally impossible. 31 tests. |
| E3a — duplicate `NotificationContainer` | (this commit) | **Was a visible bug, not render waste.** Mounted in both `Layout` and `App`, each with its own subscription, so every toast rendered twice. Removed the Layout mount; source-level guard added. |

## Closed — measured, not worth doing

**E2 — navigator bytecode chunking.** The audit said 101 KB of bytecode sits in a chunk
`/launch` eagerly imports. The 101 KB is real, but it is **not on the entry path** —
Vite already splits it into `NavigatorDeployService-*.js` (160K raw / **38K gzip**),
loaded only on `/launch` and the navigator catalog.

First-load cost for comparison (gzip): `quais` 131K · entry 104K · `react-vendor` 53K ·
`tanstack` 11K · WalletConnect `core` 162K (accepted).

Addressable win is ~28K gzip on a route reached only to deploy a navigator. Not worth
the indirection. If bundle size ever matters, `quais` and WalletConnect are where the
weight actually is.

## Remaining — opportunistic only

| Item | Est. | Assessment |
|---|---|---|
| E3b — 7 whole-store zustand destructures | 0.5d | `Header` re-renders when `sidebarOpen` changes though it only uses `toggleSidebar`. Cheap, imperceptible payoff. |
| E3c — 17 `usePageVisibility()` call sites | 0.5d | Each registers its own `visibilitychange` listener; 17 where 1 would do. Harmless. |
| E3d — `VotingSidebar` mounted twice | 1d | **Not a mistake** — legitimate responsive variants (`hidden lg:block` / `lg:hidden`). Both do run hooks and countdown timers, so it is genuine double work, but fixing it means restructuring the layout. |
| SU3/SU4 — `NavigatorService` 1,289 lines, `DaoService` 1,160 | 7d | Highest-risk change in the backlog, lowest user-visible return. Wait for a reason beyond tidiness. |
| 36 untimed `tx.wait()` calls | — | Deferred in P4; see rationale above. Best done alongside SU3/SU4, which touches the same call sites. |
| Remaining `DaoService` `catch {}` blocks | — | Deferred in P4; ~7 of 18 are correct on-chain fallbacks. |
| Testing debt | ongoing | 486 tests. Still thin on hooks and indexer services; add alongside the next change to each. |
| E1 — WalletConnect bundle weight | — | **Closed as accepted.** |

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

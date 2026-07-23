# Deferred Items — Implementation Plan

Closes the three items `REMEDIATION_STATUS.md` deferred out of P4:

1. **SU3/SU4** — decompose `NavigatorService` (1,313 lines) and `DaoService` (1,160).
2. **35 untimed `tx.wait()` calls** — a hung confirmation blocks the UI indefinitely.
3. **Remaining `DaoService` `catch {}` blocks** — some swallow indexer errors silently.

## The finding that drives the approach

All three converge on one thing the codebase lacks: **a shared write-execution path.**

Every write method in both services repeats the same shape:

```ts
const c = getContractWithSigner(id)
await estimateGasOrThrow(c, 'method', [...], 'Label')
const tx = await c.method(...)
await tx.wait()                 // untimed, and the hash is NOT recorded before the await
```

This repeats across **~26 write methods** (11 in `DaoService`, 15 in `NavigatorService`), and
every one is an untimed `tx.wait()`.

**The TxTracker durability the status doc claims does not exist for writes.** `recordTx` /
`trackedSend` / `recoverTx` are unused in production — only `hasCodeAt` is wired in (one call, in
`ReviewStep`, for the CREATE2 address probe). So a state-changing call like `submitVote` or
`processProposal` records nothing before awaiting, and a dropped receipt leaves no evidence the tx
was sent. The doc's line — *"TxTracker already records the hash before the await, so a hung wait is
recoverable"* — is **overstated**; it holds only for CREATE2 deploys via the address probe.

A single shared `executeWrite()` helper resolves all three items at once: it adds the timeout (#2),
finally wires in `recordTx`-before-await durability (the TxTracker gap), and — by removing the
duplicated boilerplate — is the precondition that makes the decomposition (#1) safe.

## Audit findings (verified against the code, 2026-07-23)

These refine the design and are already reflected in the phases below.

- **Two post-send patterns coexist.** `DaoService` writes ignore the receipt (`await tx.wait()`);
  `NavigatorService` writes check `if (!receipt || receipt.status !== 1) throw`. The helper
  standardizes on the **stricter status-check** — a silent reverted-status receipt currently passes
  through `DaoService` writes unnoticed.
- **`BaseService` exposes no `getChainId()`.** `chainId` is private with only `setChainId`.
  `recordTx` needs it, so we add a small `getChainId()` getter.
- **Multi-step flows exist** (`_subscriptionPay`'s approve→pay, the permit/approve→onboard paths).
  These cannot be a single `executeWrite` call, so the helper is **two layers**: a low-level
  `confirmTx(tx, …)` reused by multi-step flows, and a high-level `executeWrite({contract, …})` for
  the common single-send case.
- **Override quirks are real.** `processProposal` multiplies the gas estimate by 150%; quais-alpha
  throws "no matching fragment" when a trailing `undefined`/`null` override is present. The helper
  only appends an overrides object when it has keys, and threads a `gasMultiplier`.
- **Contract construction varies** (named helpers in `DaoService`, inline `new quais.Contract` in
  `NavigatorService`). The helper takes an already-constructed contract + method name + args, so it
  is agnostic to ABI/address.

## The timeout design (answers the original deferral objection)

The deferral reason was: *"a too-short timeout turns a slow confirmation into a false failure —
worse than the current hang."* The helper does **not** fabricate a failure:

1. Record the hash the instant it is known (before the await).
2. Race `tx.wait()` against a generous timeout (default **90s**).
3. On timeout, throw a typed **`TxPendingTimeout`** carrying the hash — distinct from a revert —
   and **do not** `clearTx`, so the record survives for recovery.
4. Mutation hooks map `TxPendingTimeout` to a *"still confirming — we saved your transaction"*
   state, not an error.

A hang becomes a recoverable, explicitly-pending state — strictly better than both the indefinite
hang and the naive "timeout = failure" the deferral rightly feared.

## Phases

Helper first, then the splits. Phases 0–1 deliver items #2 and the TxTracker gap in the first ~2–3
days as independently shippable wins, and remove the duplication that makes the big split risky.

| Phase | Work | Est. | Delivers |
|---|---|---|---|
| **0. Shared write path** | `TxExecutor.ts`: `waitForReceipt(tx, timeoutMs)`, `confirmTx`, `executeWrite`; typed `TxPendingTimeout` / `TxReverted`; wire `recordTx`/`clearTx`; add `BaseService.getChainId()`. Fully unit-tested. | 1.5–2d | Item #2 + TxTracker gap, centrally |
| **1. Adopt across writes** | Route all ~26 write methods through `executeWrite`/`confirmTx`, one at a time, suite green after each. Map `TxPendingTimeout` in the mutation hooks. | 1–1.5d | Kills all 35 untimed waits; removes boilerplate |
| **2. `catch {}` observability** | Categorize all 18 (most are legit read→chain fallbacks + event-log filters). Add `logIndexerFallback()` so swallowed indexer errors are visible; control flow unchanged. | 0.5d | Item #3 |
| **3. Split `NavigatorService`** | Extract 8 per-type sub-services (Onboarder, ERC20Tribute, NFTGated, Signal, Budget, Vesting, Timelock, Subscription — section boundaries already exist); `NavigatorService` becomes a thin facade preserving its public API. | 2–2.5d | Item #1a |
| **4. Split `DaoService`** | `DaoReadService` (indexer-first + fallback) / `DaoWriteService` / `LaunchService`, `DaoService` as facade. | 1.5–2d | Item #1b |
| **5. Verify** | Full suite + tsc + lint + build; testnet smoke of one write path. | 0.5d | Confidence |

**Total ~7–8.5 days** — the doc's 7d for SU3/SU4 alone, with #2 and #3 folded in at near-zero
marginal cost.

## `executeWrite` contract (Phase 0)

```ts
class TxPendingTimeout extends Error { readonly hash: string }   // still confirming, recoverable
class TxReverted extends Error { readonly hash: string }          // receipt.status !== 1

// Low-level: record → wait(timeout) → status-check → clear. Reused by multi-step flows.
async function confirmTx(
  tx: { hash: string; wait: () => Promise<quais.TransactionReceipt | null> },
  opts: { label: string; step?: string; timeoutMs?: number },
): Promise<quais.TransactionReceipt>

// High-level: estimate → send → confirmTx. The common single-send case.
async function executeWrite(p: {
  contract: quais.Contract
  method: string
  args: unknown[]
  label: string
  step?: string
  overrides?: Record<string, unknown>
  gasMultiplier?: bigint     // e.g. 150n for processProposal
  timeoutMs?: number         // default 90_000
}): Promise<quais.TransactionReceipt>
```

Ordering guarantee: `recordTx` is called **after** the hash is known and **before** the receipt is
awaited; `clearTx` runs **only** on a confirmed receipt (never on timeout).

## Risk controls

- **Facade pattern** — both services keep their exact public API; no call site (hook or component)
  changes. The indexer + hook tests added in the 499→700 pass are the regression net.
- **Behavior-preserving** — the only intentional change is the timeout/recording (isolated to
  Phase 0, unit-tested) and the stricter receipt status-check (a correctness improvement for
  `DaoService` writes).
- **Incremental & green** — one method / one sub-service per commit; each phase ships on its own.
- **Coverage earns out** — a 130-line `VestingNavService` is unit-testable in a way the monolith
  never was; the split adds tests as it goes.

## Sequencing note

This inverts the status doc's assumption ("do the waits alongside the decomposition"). Do the shared
helper **first**: it delivers the two small items immediately and lets us decompose clean code
instead of a 26-way copy-paste. Phases 0–1 (~3d) are the high-value core and are independently
shippable even if 3–4 are scheduled later.

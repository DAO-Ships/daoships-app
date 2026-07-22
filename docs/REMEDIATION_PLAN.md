# Remediation Plan — Web App Audit 2026-07

Companion to `WEBAPP_AUDIT_2026-07.md`. Scope confirmed: all 172 findings are against `daoships-app`
(`src/` ×163, `vercel.json` ×4, `package.json` ×3, `.env.example`, `vite.config.ts`). Zero findings
against `daoships-contracts`, `daoships-indexer` or `daoships-www` — those were read as reference only.

## What counts as "material"

A finding is material if it can cause any of:

1. **Fund loss or misdirection** — value moves somewhere the user did not intend.
2. **Misinformed consent** — a voter or member approves something the UI described incorrectly.
3. **Irreversible state** — immutable constructor args, burned shares, committed merkle roots.
4. **Silent wrong data** — a failure rendered as a legitimate, confident-looking value.
5. **Production breakage** — the app is dead or unusable for a class of users.
6. **A structural enabler** — the absence of it is why other defects shipped.

By that test: **all 3 High + all 32 Medium are material**, plus 6 Low findings that touch immutable
state or fund flow (S7, S8, and the `TransactionBuilder` emit inside ST10), plus SU1 (dead code) as a
prerequisite. The remaining ~109 Low findings are quality work, tracked but not scheduled here.

**Material total: 10 work packages, ~26 dev-days.**

---

## Sequencing

```
WP1 Build gate ─────────────────────────┐  (unblocks everything; do first)
WP2 Decoder truth ──────────────────────┤  (independent — can run in parallel with WP1)
                                        │
WP3 Token decimals ─────────────────────┤
WP4 Fail-loud reads ────────┬───────────┤
WP5 Governance parity ──────┘           │  (WP5 quorum work shares files with WP4)
WP6 Input validation ───────────────────┤
WP7 Config & CSP ───────────────────────┤
                                        │
WP8 Transaction durability ─────────────┤  (largest; needs WP1 landed)
WP9 Scale / pagination ─────────────────┤
WP10 Stability polish ──────────────────┘
```

Only one hard ordering constraint: **WP1 before everything that adds code**, because `tsc -b` must
start passing before new work can be gated on it. WP2 is deliberately first-or-parallel — it is the
highest-value fix in the audit and touches one file nothing else touches.

---

## WP1 — Build gate and dead code · 3 days · **do first**

Findings: ST7, ST6, SU1

The enabler. `"build": "tsc && vite build"` against a `tsconfig.json` of `{"files": [], "references": [...]}`
compiles **zero files**. 51 errors ship. Fixing this is one word, but it must land *with* the error
fixes or every deploy breaks.

Order matters inside this package:

1. **Delete the 26 unreferenced files** (3,135 LOC) first. ~10 of the 51 errors live in dead files
   (`ProposalStatusBadge.tsx`, `NavigatorDetailCard.tsx`), and leaving them in misdirects triage away
   from the one live bug.
2. **Fix `SubscriptionPlugin.tsx:589`** — add the missing `parseTokenAmount` import. This is a shipped
   `ReferenceError` swallowed by `catch { return 0n }`, permanently disabling the only in-app recovery
   UI for subscription navigators. *(Verified independently: grep finds exactly one occurrence in the
   file, the call site, with no binding.)*
3. **Clear the remaining ~41 errors.**
4. **Flip to `tsc -b && vite build`**, add `"typecheck": "tsc -b"`.
5. **Add `.github/workflows/ci.yml`** — `npm ci && npm run lint && npm run test:run && npm run build`.

Note: `lint` and `test:run` both pass today, so CI's marginal value is modest. **The load-bearing fix
is `tsc -b`.** Narrow the bare catch in step 2 so a programmer error is never again indistinguishable
from bad user input.

**Done when:** `npm run build` fails on a deliberately introduced type error.

---

## WP2 — Voter-facing transaction truth · 1.5 days · **highest value**

Findings: S1 (High), S2 (Medium)

`decodeSingleTx(tx: {to, value, data})` throws away the fields that determine what a transaction
actually does, while the render layer prints confident labels derived from a strict subset of what
will execute. One over-narrow type signature causes all of it.

- `executeAsGovernance` is decoded from `args[2]` only; `args[0]` (target) and `args[1]` (value) are
  never read. `decodeProposalActions(proposalData)` takes no DAO address, so no cross-check is
  possible even in principle. *(Verified independently at `ProposalDecoder.ts:199-208`.)*
- `tx.value` survives in only 2 of 7 branches — an ERC-20 `transfer(attacker, 1)` carrying
  `value: 999e18` renders as a 1-wei dust transfer.
- The MultiSend `operation` byte is read at line 74 and dropped at 199.
- `queueChange` is matched by selector alone, then given explicitly calming copy about timelock delays.

**Fix:** widen `DecodedAction.details` to carry `value` and `operation` on every branch. Thread `daoId`
(already in scope at `ProposalActionSummary.tsx:371`) into `decodeProposalActions`/`decodeSingleTx`.
Take the governance branch **only** when `tx.to === daoId && args[0] === daoId && args[1] === 0n` —
exactly the shape `ProposalEncoder.wrapGovernance()` can produce. Anything else falls through to
`custom`, which already surfaces target, value and calldata correctly. Require
`navigator_type === 'TimelockNavigator'` before the timelock narrative, mirroring the check
`CustomActionDetail.tsx:60-65` already implements for vesting.

**Tests:** this is pure-function territory and currently untested. Add fixtures for the spoof payloads
in the audit — a governance wrapper with a non-DAO target, a value-bearing ERC-20 transfer, an
`operation=1` entry, a `queueChange` to an unregistered address. Each must render as `custom`.

**Done when:** the audit's exact spoof payload no longer renders as "Mint shares to 1 address".

---

## WP3 — Token decimals on write paths · 2 days

Findings: ST1 (High)

Every **read** path resolves decimals correctly; every **write** path hardcodes 18. Same bug, five
files, one root cause.

| Site | Consequence |
|---|---|
| `ReviewStep.tsx:275-276` + `NavigatorCatalog.tsx:525-526` | ERC-20 tribute prices are **immutable constructor args**. `1` becomes 10¹² USDC/share. Unfixable without governance redeploy + re-sanction. |
| `BudgetPlugin.tsx:398, 636` | 10,000 USDC budget encodes a 10¹⁶ allowance — the cap stops constraining. Disburse reverts while "Remaining" reads 10¹² times too small. `useTokenMetadata(budget.token)` is already called at `:487` and only `.symbol` is read. |
| `TransactionBuilder.tsx:345` | `tokenMeta?.decimals ?? 18`, emit gated on `isValidToken && encodedData` but never on `tokenMeta` having loaded. |

**Fix:** thread real decimals (`fetchTokenMetadata` exists; `NavigatorService.ts:406-412` is the
correct pattern already in the codebase). Add `decimals: number` to `TransactionBuilder`'s `KnownToken`
— `NewProposal.tsx:811` already passes it and the sibling `CustomActionForm.tsx:27-32` already declares
it. **Block the deploy/disburse/emit button until decimals resolve for any non-native token. Never
default to 18.**

The tribute case is the priority inside this package: it is the only one that is permanent.

---

## WP4 — Fail loud instead of returning plausible empties · 4 days

Findings: ST2 (High), ST3 (Medium), ST9 (Medium), S4 (Medium)

The dominant stability theme. `indexerError.ts` was built *precisely* because "views showed an EMPTY
state when the indexer was actually down" — and then every throw got re-swallowed one layer up.

- **ST2 — ragequit burns for zero payout.** `getGuildTokens` returns `[]` on failure with the comment
  "No on-chain list enumeration available". That comment is false: `getOnChainGuildTokens` exists 16
  lines below with **zero callers**. `RagequitModal` renders the empty list as a positive assertion
  ("This DAO has no guild tokens configured") and `canReview` requires no token, so the burn proceeds.
  Asymmetric and therefore reachable: `getMember`/`getDao` *do* fall back on-chain, so balances render
  fine while the treasury reads empty.
- **ST3 — 14 `catch { return [] }` sites** make consumer error branches unreachable dead code
  (`Explore.tsx:119`'s `) : error ? (` can never render). Plus all reads gate on a **separate health
  endpoint** that defaults to `''` in prod, caching `healthy: false` forever while PostgREST is fine.
- **ST9 — lossy on-chain fallbacks:** `voting_power: '0'` after fetching the real value into
  `_currentVotes` (one-line fix, currently blocks a 100%-shareholder from sponsoring during an
  outage); snapshot written to the wrong field; 20-proposal truncation with no outer loop.
- **S4 — sanction wipe.** Depends on ST3: the realistic trigger is `getNavigators`'s silent `[]`, which
  makes `NavigatorSanctionForm` post an endorsement set of exactly one while the banner promises
  "Your DAO's other endorsements are preserved."

**Fix (one rule, applied everywhere):** *a read helper may return an empty result only when it can
prove the source was consulted successfully — otherwise it throws.* Call the on-chain fallback where
one exists; delete the bare catch where one doesn't, so `isError` UI and React Query retry engage.
Stop gating Supabase reads on a separate health endpoint — mirror the `getDao` pattern (try, fall back
on throw), which the author already documented at `DaoService.ts:169-173` but applied to one method.

---

## WP5 — Governance parity with the contract · 2.5 days

Findings: ST4 (Medium), ST8 (Medium)

`willProposalPass` is **correct** — the hard math mirrors `_didProposalPass` faithfully. The bugs are
all in second, ad-hoc copies.

- **ST4:** `VotingSidebar.tsx:107-114` uses `yes+no` over the **shares+loot** high-water mark; the
  contract uses `yesBalance` over the **shares-only** sponsor snapshot. Worked example from the audit:
  1000 shares + 4000 loot, quorum 20%, yes=100/no=900 → sidebar renders green "Quorum: Reached" while
  the contract state is `Defeated`. The same page shows two contradictory verdicts.
- **ST8:** five divergences — missing `MAX_VOTING_PERIOD`/`MAX_GRACE_PERIOD` bounds (in the ABI,
  referenced nowhere); raw vs `min(threshold, sharesTotalSupply)` sponsor comparison; `canVote` never
  checking `getPriorVotes` at the snapshot; `min_retention_percent` absent from `RagequitModal`;
  `deriveProposalStatus` ordering vs `DAOShip.sol:760-778`.

**Fix:** export a single `quorumStatus(proposal, quorumBps)` from `types/proposal.ts` and call it from
both sites — the structural fix, not a patch. Read the MAX constants from the ABI into
`GovernanceEncoder`. Add a `getPriorVotes(address, voting_starts)` hook alongside `useHasVoted`.

**Tests:** add the loot-heavy quorum case as a regression fixture. `types/proposal.ts` has no test file
at all today and it decides which bytes go on-chain.

---

## WP6 — Input validation and encoding safety · 3 days

Findings: ST10 (Medium), ST11 (Low–Medium), S7 (Low), S8 (Low)

`LaunchWizard`'s `useForm` has **no resolver**. `shares`, `loot`, `proposalOffering`,
`sponsorThreshold`, `lootMultiplier`, `mintCap`, `perAddressCap` are unvalidated free text feeding
strict `BigInt` calls — and the failure surfaces *after* salt mining and after navigator deploys have
been paid for. Verified behaviours: `"1,000"` throws mid-pipeline; `"0.0000000000000000001"` silently
becomes `0n` (a member minted zero shares).

Highest-consequence item in this package: **`TransactionBuilder.tsx:506`**. When `encodeFunctionData`
throws, the action still emits `{to, value: valueWei, data: '0x'}` labelled `Call <fn>()` — a payable
call with a mistyped param becomes a **bare value transfer to the contract's fallback**, presented as a
function call. Genuine fund-loss potential; fix this one first.

Also: `navigatorValidation.ts` already defines and unit-tests `onboarderMultiplierSchema`,
`onboarderFixedPriceSchema` and `erc20TributeSchema` — imported by **zero** components, while the
sibling signal/timelock/subscription schemas from the same file *are* wired in. The validation already
exists; it just isn't connected.

S8 (allowlist shard validation) is Low-severity but included because `allowlistRoot` is a constructor
arg with no setter — the mistake is permanent until redeploy.

---

## WP7 — Config and deployment safety · 1 day

Findings: S6 (Medium), S5 (Medium), ST13 (`main.tsx` white page)

- **S6:** all nine contract addresses use `|| '<stale testnet literal>'`. `validateContractConfig`
  rejects only falsy-or-malformed values, so the PROD `throw` **can never fire for a missing var** —
  the fallback already substituted something valid. Commit `49001d1` ("Deploying to mainnet") updated
  `NETWORK_CONFIG` but left the literals on testnet. *(Consistent with what I verified earlier: those
  literals are the live Orchard set, all dead on chain 9.)*
  **Fix:** gate the `||` defaults on `import.meta.env.DEV` so the existing throw does its stated job.
- **S5:** `connect-src` allows only `*.walletconnect.com`; the installed core defaults to
  `wss://relay.walletconnect.org`. The only non-injected wallet path is **dead in production**. Also
  missing: `api.web3modal.org`, the explorer origin (ABI decode), `ipfs.io` (NFT images).
- **`main.tsx:9`:** `validateContractConfig()` throws before `createRoot().render()`; `#root` has no
  fallback markup and the ErrorBoundary lives inside `App` — a bad env var is a permanent white page.

**Decision required — see below.**

---

## WP8 — Transaction durability · 3 days

Findings: ST5 (Medium)

Nothing in the app captures a tx hash before awaiting a receipt — not launch, not navigator deploy,
not `submitProposal`, not votes. `useTransactionFlow`, the hook written to solve this, has **zero
consumers**. `tx.wait()` is called ~35 times with no timeout, and there is no `beforeunload` guard
during a 3–4 transaction pipeline.

Worst manifestation: a broken `tx.wait()` during launch leaves `launchResult: null` while the DAO is
deployed. Both "Retry" and "Resume" re-broadcast the **same CREATE2 salts**, which must revert on
collision. The predicted DAO address is sitting in state, unused and never shown. Only "Start Fresh"
proceeds — mining new salts and paying for a second full launch.

**Fix:** a `TxTracker` that records `{hash, step, timestamp}` *before* the await and offers receipt
recovery on resume. Probe `salts.daoShip.address` with `quai_getCode` before running the launch step
and reconstruct from predicted addresses if code is present — `verifyContractDeployments` already has
a working `quai_getCode` helper the launch flow never calls. Wrap navigator post-deploy verification
so a transient read failure never discards a paid-for address.

This single abstraction closes ST5's three manifestations plus the duplicate-proposal and
duplicate-navigator cases.

---

## WP9 — Scale · 3.5 days

Findings: SC1 (Medium), SC2 (Medium)

`grep -rn "\.range(" src/` returns **nothing**. No offset or cursor pagination anywhere; every list
query is capped at a hardcoded 200 or unbounded, with all pagination, filtering and sorting done
client-side over the truncated window. SC2: the full proposal table — including `proposal_data` and
attacker-authored `details` — is re-downloaded every 10 seconds.

Not urgent at ~1 live DAO, but it is a silent-truncation class: past the cap, rows simply vanish with
no indicator. Cheap parts (narrow the projection, raise the poll to 30s, lazy `proposal_data`) are
half a day and worth taking early.

---

## WP10 — Stability polish · 3 days

Findings: ST12, plus selected ST13 items

`Modal.tsx:85-91` (focus yanked mid-typing on every parent re-render — the codebase already has the
correct `prevOpenRef` pattern in `RagequitModal.tsx:149-163`); the `['votes']` vs `['proposalVotes']`
query-key mismatch that makes the realtime votes channel inert; `TransactionErrorHandler` having zero
callers so a deliberate wallet cancellation renders identically to a hard failure; `ErrorBoundary`
sitting inside `Layout` with no reset; salt-mining cancel deadlocking the pipeline promise.

---

## Decision required

**WalletConnect: fix or drop?** The CSP currently blocks its relay, so the connector is dead in
production *and* costs ~1 MB / 457 KB gzip that loads on every page view — it fires at module-eval via
`connector.setup?.()`, before React mounts, regardless of `reconnectOnMount`.

- **Fix CSP** (~15 min): restores WalletConnect, keeps the 1 MB.
- **Drop the connector** (~30 min): reclaims ~1 MB and closes E1 outright, leaving Pelagus/injected as
  the only path.

Both are cheap; they point opposite ways. Given that the connector is already non-functional in
production and nobody has reported it, dropping it is the better default — but that is a product call
about which wallets you intend to support, not an engineering one.

---

## Not scheduled

~109 Low findings: the succinctness refactors (`NavigatorService` decomposition, `useRealtimeTable`
extraction, `indexerQuery()` helper), the render-waste batch, and the security hardening batch (S9).
Worth doing, none of them material by the test above. The `NavigatorService` split (4 days) is the
largest and should wait until the material work is done.

**Coverage debt is the standing risk:** 5.4% of LOC, and it is inverted relative to consequence — all
55 hooks, all 12 indexer services, all 12 pages and the 1,139-line `DaoService` have zero tests, while
pure utils are well covered. Rather than a separate testing project, each work package above adds
tests for what it touches; WP2 and WP5 are pure functions and should come out well covered.

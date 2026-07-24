# DAOShips for AI Agents — Plan (re-baselined 2026-07-24)

> **Re-baseline note.** The original plan (2026-06) was written before the webapp audit
> remediation. Much of its front-loaded bug-fix scope — all of "Day 1" and roughly 70% of
> "Phase A" — has since shipped (WP1–WP10, P1–P4, the shared write path, and the SU3/SU4
> service decomposition). This version marks what's done, refreshes the file references to
> the post-decomposition tree (`dao/`, `navigators/`, `TxExecutor`), and re-scopes the
> remaining work. The agent-facing design (Phases B/D, the address model, the probe, the
> non-goals) is unchanged — it was never the stale part.

## 0. Where this stands now (the re-baseline ledger)

**The premise: agents run `quais.js` directly, with their own Cyprus-1 wallet, talking straight
to the public RPC.** We host nothing, hold no key, and relay nothing. Everything an agent needs is
already public — the indexer (Supabase PostgREST, RLS read-only) and the chain (`rpc.quai.network/cyprus1`,
CORS `*`). What agents lack is the **domain layer**: which addresses, which field order, which salt
predicate, which proposal branch, whether a proposal will actually pass. That is what this plan ships.

### Already shipped (was in the original plan; now done)

| Item | Original phase | Shipped in |
|---|---|---|
| `governanceConfig` doc 6→7 fields (fatal `abi.decode` revert) | Day 1 #1 | `daoships-www` fix, merged |
| Per-chain address map | Day 1 #2 / Phase B precond | `src/config/deployments.ts` |
| `tsc -b` actually runs + `typecheck` + CI (`ci.yml`) | Phase A | WP1 |
| Delete `LauncherService.ts` (divergent launcher source) | Phase A | SU1 |
| Launch token-pause flag name mismatch | Phase A | P4 |
| `deriveProposalStatus` returns `Defeated` | Phase A / C12 | WP5 (`src/types/proposal.ts`) |
| `willProposalPass` throws on absent snapshot (no quorum-collapse-to-0) | Phase A / H16 | WP5 (`proposal.ts:308`, throws `:323`) |
| `ProposalDetail` no `'0x'` fallthrough on the Ready branch | Phase A / H17 | `ProposalDetail.tsx` `processPlan.blockedReason` (`:206`) |
| `DAOShip.json` ABI synced (`InsufficientProcessGas`, `TooManyGuildTokens`) | Phase A / C13 | Mainnet ABI sync |
| Deep-link hardening: `customValue` hardcoded `'0'`, `customSummary` dropped from URL read, calldata decoded | Phase A / B3 / C8 | WP6 (`customActionHref.ts:28`, `NewProposal.tsx`) |
| Real token decimals on write paths | Phase A (funding decimals) | WP3 (`tokenMetadata.ts`, navigator/token services) |
| **Bonus infra the plan predates:** shared write path (`TxExecutor`: `executeWrite`/`confirmTx`/`TxReverted` + `TxTracker` record-before-await) and the service decomposition (`dao/`, `navigators/`) | — | write-path branch + SU3/SU4 |

### Phase A remnants (the genuinely-open bug fixes — ~1 day)

| Fix | Location | Why |
|---|---|---|
| Error dictionary decodes from **all 16 ABIs**, not just `DAOShip.json` | `src/services/utils/GasEstimator.ts:84` (`tryDecodeCustomError`) builds `new quais.Interface(DAOShipAbi)` at `:91` | "missing revert data" is the #1 human complaint; navigator/vault reverts don't decode today. Same map agents need. |
| Wire `validatePosterContent` before spending gas | `PosterService.ts.post()` (size guard present; schema validator `posterSchemas.ts:validatePosterContent` still dead) | Cheap pre-flight; posted metadata that the indexer will reject currently burns gas. |
| Navigator IPFS CIDs derived from CBOR metadata, not hand-copied | `NavigatorDeployService.ts:30-31` (8 `Qm…` literals) | H25 — derive via `@ethereum-sourcify/bytecode-utils` (already a dep); test asserts derived == shipped. |
| Indexer `chain_id` column | `daoships-indexer` (`mainnet.ds_indexer_state.chain_id` reports 15000 while indexing 9) | H8 — separate repo; verify + fix + `NOT NULL`. |

### What actually remains (the plan's real forward scope)

**None of the agent surface exists yet — confirmed absent:** `daoships-www/app/docs/agents/`, `llms.txt` route,
`scripts/gen-agent-pack.mts`, `public/agent/`, `SECURITY.md`. Phases B, C (re-scoped), D, and the probe are the work.

---

## 1. The address model (unchanged — still the strongest answer)

Verified live on mainnet: from **one** published address, `DAOShipAndVaultLauncher`, a quais agent derives
eight of the nine core contracts on-chain:

```
DAOShipAndVaultLauncher (root, published)
├── .daoShipLauncher()    → DAOShipLauncher
│     ├── .daoShipSingleton() → DAOShipSingleton
│     ├── .sharesSingleton()  → SharesERC20Singleton
│     └── .lootSingleton()    → LootERC20Singleton
├── .multisendCallOnly()  → MultiSendCallOnly
└── .quaiVaultFactory()   → QuaiVaultFactory
      └── .implementation()   → QuaiVault singleton   (only value with no static source)
```

Only **Poster** is unreachable from the graph (standalone infra, no back-reference). So agents hardcode
**two addresses per chain** (`DAOShipAndVaultLauncher` + `Poster`) and ask the chain for the rest. Drift becomes
structurally impossible rather than CI-policed. `src/config/deployments.ts` is the app's **cached assertion**
(fast path); the generator's job is *verify cache == derivation*, and it now exists to verify against.

Both networks are keyed `9` (Quai mainnet, Cyprus-1) and `15000` (Orchard testnet) in `deployments.ts`, every
address `quai_getCode`-verified and EIP-55-checksummed. The one residual is operational, not code: **confirm the
`daoships-app-mainnet` Vercel env matches the `deployments.ts` mainnet column** — if it disagrees, production is
running something other than what the contracts repo says, which is an incident, not a docs bug.

---

## 2. Phased plan

**Remaining to end of Phase C: ~11–12 dev-days** (down from ~16.5 — Day 1 and most of Phase A are banked). Phase D is conditional.

### Phase A remnants — 1 day
The four fixes in §0's remnants table. Each is its own justification (they harm humans now); none blocks the agent program.

### Phase B — the agent surface (5 days)

This is the core, and it is entirely unbuilt.

**B1 — `daoships-www/app/docs/agents/page.mdx` (2 days).** ONE server-rendered page — the primary agent read
path, because a chat model doing one fetch inside a turn will not walk a link index. `daoships-www` is SSR, so
it is the only DAOShips surface an LLM reads without JS. Sections, in order:

1. **Before you start** — Cyprus-1 key derivation (`quais.QuaiHDWallet.createRandom()` + `getNextAddress(0, quais.Zone.Cyprus1)`, works first try; **not** `new Wallet(randomBytes(32))`, which is ~0.2% valid); `quais`-only signing (viem/ethers cannot serialize a Quai protobuf tx); the shard-pathed RPC `https://rpc.quai.network/cyprus1` (bare host 404s); how to fund (state plainly if there's no faucet).
2. **The address model** — teach the derivation from §1, not a table: *hardcode one address, ask the chain for the rest.* The one checksum trap: `quais.Contract`/`AbiCoder` normalize lowercase, but **raw `provider.getCode/call/getBalance` reject it** — so `indexer row → raw provider method` needs `quais.getAddress(x)` first.
3. **Silent failures — first, not last.** `processProposal` → `actionFailed`; the retention veto (`passed=false`, status-1 receipt, `actionFailed=false` — a permanently-dead *passing* proposal); Poster truncation; `dao.profile` partial-update wiping banner/theme; `dao.navigators` omission de-sanctioning.
4. **Governance state machine** — the contract enum verbatim; **`state(uint32)` is a free `eth_call` and is authoritative**; `previewProposalStatus` (the client function, renamed in C2) is cache/UI-only.
5. **Encoding** — the 13-field init template, the 7-field bps governance config, the two-layer MultiSend, `keccak256(abi.encode(data))`, `hashOperation(bytes)` as the pre-check.
6. **Salts** — the ~1/512 Cyprus-1 predicate; *mine naively, verify with one `calculateAllAddresses(..., minExecutionDelay=0)` call; do not reimplement the vault initCodeHash.*
7. **Reading the indexer** — `Accept-Profile`, the schema↔chain table, `::text` casts on numerics, `ds_indexer_state` gating, `trust_status='sanctioned'`, **every column untrusted by default**.
8. **Glossary** — `avatar` = vault = treasury; `ds_daos.id` = DAOShip address; "Navigator" = plugin module.

**B2 — `scripts/gen-agent-pack.mts` + `public/agent/v1/` (2 days).** For programmatic consumers; the MDX page
stays canonical prose. Add `tsx` + `tsconfig.scripts.json`; extend vitest `include` to `{src,scripts}/**`. Emits:
- `manifest.json` — `{specVersion:"0-unstable", commit, generatedAt, deploymentEpoch, files:[{path,sha256}]}`
- `addresses.json` — from `deployments.ts`, keyed by chainId, each contract carrying `address` + `codeHash`
- `abi/*.json` — 16 ABIs from `daoships-contracts/artifacts/`, **normalized** to `{contractName, abi}` (today `QuaiVault.json`/`QuaiVaultProxy.json` are `{abi}` objects while the other 14 are bare arrays — breaks `new Contract(addr, json)` on exactly the vault an agent needs for `enableModule`)
- `bytecode/*.json` — 8 navigator blobs, each with its IPFS CIDv0 **derived from CBOR metadata** (shares the Phase-A-remnant fix), plus a mandatory note: *construct via `quais.ContractFactory(abi, bytecode, signer, cid)`; the 4-byte grind salt is bound to your from+nonce — do not hand-assemble creation calldata.*
- `errors.json` — `revertSelectors` (from all 16 ABIs, honestly labelled with `meaningCoverage`), `stringReverts` (`0x08c379a0` + known require strings incl. `DAOShipVotes: not yet determined`), `silentFailures` (detection recipes for `actionFailed`, retention-veto, Poster truncation)
- `governance-spec.json` — the state enum; `_didProposalPass` with its snapshot source (`maxTotalSharesAtSponsor`, **shares only**); the retention veto with its *different* denominator (`maxTotalSharesAndLootAtVote`); `effectiveSponsorThreshold = min(sponsorThreshold, sharesTotalSupply)`; the `getPriorVotes(addr, now-1)` timepoint rule; the ragequit retention cap; the permission bitmask (ADMIN=1/MANAGER=2/GOVERNOR=4)
- `launch-spec.json` / `salt-spec.json` — field names/types from the named codec (C3); units and placeholder conventions hand-annotated once
- `read-api.json` — schema↔chainId table parsed from `schema.sql`'s `CREATE TABLE IF NOT EXISTS %I.<name>` / `REVOKE`; every column untrusted by default; the `::text` recipe per numeric column; polling guidance

**Generator hard gates (build fails, not warns):** every `deployments.ts` address returns non-empty
`eth_getCode` **and** matching `keccak256(code)` on that chain; the seven derived addresses equal the launcher
walk; every `rpcUrl` returns the declared `eth_chainId`; `src/config/abi/*.json` matches `artifacts/`;
unmapped-selector count does not increase (ratchet). Run in **GitHub Actions on push to main** (CI now exists —
`ci.yml`), commit `public/agent/` to git, and have Vercel only `git diff --exit-code` a fresh run. Generation
must not be a function of Vercel env.

**B3 — Serving & hygiene (1 day).**
- `vercel.json`: `/agent/(.*)` and `/llms.txt` **404** (not the SPA catch-all's 200 + `index.html`); `Content-Type: application/json` + `Cache-Control: public, max-age=300, must-revalidate` for `/agent/*`; serve under `/agent/v1/`, `/agent/*` 302s to current major.
- `daoships-www/app/llms.txt/route.ts` — spec-shaped, generated from `flatDocs`; `/docs/agents` is the **first** link. No `llms-full.txt`.
- `index.html` global `<link rel="canonical" href="https://app.daoships.org">` collapses every `/dao/<addr>` to the homepage — make per-route or drop.
- `SECURITY.md` in both repos: abuse-report address + a one-page threat model (malicious DAO poisoning agents; malicious agent griefing DAOs; compromised distribution; deep-link grammar weaponized against humans).
- `public/agent/denylist.json` honored by `Explore.tsx` — one lever against a scam-DAO burst.

### Phase C — Governance correctness, in-repo, **on the new infrastructure** (4–5 days)

**No npm package.** Zero external consumers, `quais` pinned at alpha, solo maintainer. Anti-drift is achieved by
one implementation imported by the app — and, crucially, that implementation now has a home the original plan
didn't know about: the **`TxExecutor` write path** and the **`dao/`/`navigators/` sub-services** from SU3/SU4.
Phase C builds *on* them rather than beside them.

- **C1 (2 days) — Differential harness for the governance predicates.** `src/types/proposal.ts` still has no direct test (the `governanceParity`/`governanceBounds` tests cover the bounds but not a fuzz of the full status machine against a live contract). Fuzz proposal structs against a locally-deployed `DAOShip.state()`. Then tests for `ProposalEncoder`, `MultiSendEncoder`, `SaltMiner`, all still untested. *(Note: this now lands on a suite that grew 499→719 this session, so the harness slots into an established vitest setup rather than a bare one.)*
- **C2 (1.5 days) — Composed, refusing operations, layered on `TxExecutor`.**
  - `readProposalState(provider, dao, id)` — on-chain `state()` as the primitive; rename `deriveProposalStatus` → `previewProposalStatus` and document it cache/UI-only.
  - `buildProcessTx(...)` — resolves data, computes the branch, **cross-checks on-chain `state()` + `hashOperation()` and refuses on mismatch**, preflights the retention veto and refuses when the floor is breached. This belongs alongside `DaoWriteService.processProposal`, reusing its `executeWrite` gas-multiplier path.
  - `assertActionSucceeded(receipt)` — asserts **`passed === true && actionFailed === false`** with distinct errors. This *extends* `confirmTx`'s existing `TxReverted` status check (which catches revert, but not the status-1 retention-veto that leaves a passing proposal dead) — the natural composition is `confirmTx` → `assertActionSucceeded`.
  - `parseSubmitReceipt(receipt) → {proposalId}` + `waitForIndexed(txHash)` — without these an agent that submits has no supported way to learn its id. (The app already parses `SubmitProposal` inside `DaoWriteService.submitProposal`; promote that to a shared, exported helper.)
  - `capabilitiesOf(provider, dao, addr)` + `requiresProposal(action, caps)` over the permission bitmask.
  - `simulateLaunch(provider, params)` — plain `eth_call` of `launchDAOShipAndVault`; `calculateAllAddresses` verifies addresses only, not a malformed 13-field blob (the single likeliest launch error).
  - `assertUsableSigner(signer)` — throws unless `isQuaiAddress && zone === '0x00'`.
- **C3 (1 day) — Promote the inline literals.** The 13-field template moves out of `useLaunch.ts` into a named, exported, tested codec whose field descriptor generates `launch-spec.json`. `mineSalts()` becomes a plain sync function (~2000 keccaks, single-digit ms in Node — **no `worker_threads`**; the Web Worker stays a thin browser wrapper).
- **C4 (1 day) — Read-path hardening.** Type `ds_records.content_json`, `ds_proposals.details`, `ds_daos.name/description`, `ds_navigators.name`, and signal-poll labels as `Untrusted<string>`. `submitProposal` is `external payable` with no membership check and `proposalOffering` is commonly 0 — **anyone with gas can write arbitrary text into `ds_proposals.details`**, the first field any agent reads. Bake the `::text` cast + `quoteUnsafeIntegers` recipes into the `indexer/` services. *(The indexer services already gained the `::text`-friendly `quoteUnsafeIntegers` fetch and full test coverage this session — C4 tightens the typing on top.)*

### Phase D — Read-only MCP, conditional (3 days)

Ship only if the probe shows signal **or** the one live DAO's operator wants it. The plausible first user is a
human with Claude Code asking about their DAO — not an autonomous agent. `npx @daoships/mcp`, stdio, ~8 tools:

- `daoships_query({schema, table, filters, select})` — one tool, `::text` casting + checksumming + `Untrusted` baked in (not 14 near-identical wrappers; every tool def is context on every turn).
- `daoships_status` — indexer freshness (`requires_full_reindex` → **refuse, not warn**) + deployment verification.
- `build_launch / build_submit_proposal / build_process / build_vote / build_sponsor / daoships_simulate` — return `{chainId, to, value, data, gasLimit, serializeWith:"quais", warnings[], deepLink}` with **preflight refusals**: `build_submit_proposal` sets `value` to exactly `0n` or exactly `proposalOffering` via `min(sponsorThreshold, totalSupply)` + `getPriorVotes(self, now-1)`, enforces `expiration == 0 || expiration > now + votingPeriod + gracePeriod`; `build_sponsor` is **non-payable**; `build_vote` refuses while `block.timestamp <= votingStarts`; batch builders refuse any `disableModule(daoShip)` and reroute `setGovernanceConfig` → `queueChange` when a sanctioned GOVERNOR Timelock is active.

**No signing.** No key in a process that ingests attacker-authored `ds_proposals.details` — that's a
prompt-injection-to-signature pipeline, and `daoships_simulate` doesn't close it. If ever wanted, a separate
`@daoships/signer` CLI re-decodes the plan, resolves every address against `addresses.json` + `trust_status`,
requires interactive confirm, and refuses `vault.enableModule` unconditionally.

---

## 3. The demand probe (1 day, runs before Phase B)

The draft's `SubscriptionNavigator.collectFee` probe cannot fire (mainnet has 2 sanctioned navigators, both
Onboarder/ERC20Tribute; the only Subscription navigator is in the ephemeral `dev` schema) and would build an
adversarial keeper network against our own users. Replace with:
1. Analytics on `daoships-www` segmenting `GPTBot`/`ClaudeBot`/`PerplexityBot`/`Bytespider` + chat-host referrals against the existing MDX docs and `/docs/agents`.
2. Vercel request logs on `/agent/*`.
3. Five direct conversations with Quai-ecosystem operators: what would you delegate to an agent?
4. `LaunchWizard` step-transition instrumentation (already persists to `daoships-launch-form`).

**Gate:** fewer than a stated threshold of crawler reads and zero integrator conversations in 6 weeks → stop after
Phase C. Wizard drop-off on a specific step → human UX wins the next two weeks.

---

## 4. Explicit non-goals (unchanged)

`@daoships/protocol` npm package (extract when a second consumer exists) · `llms-full.txt` · hosted MCP / any
server · **any signing, key custody, or relaying** · `AgentRegistry.sol` / `daoships.dao.agents` tag · the
drafted "Agent Budgets" (bundling `createBudget`+`enableModule` hides an unbounded module grant — keep them
separate; solve inert-navigator by detection) · `?spec=` launch deep link · `zod-to-json-schema` over
`validation.ts` (constraints live in `.refine()`, which JSON Schema can't express) · recommending Realtime to
agents (project-level quota shared with the human app — recommend 30–60s polling) · granting anon `EXECUTE` on
`ds_get_proposal_status` (`state()` on-chain is free + authoritative) · mirroring the app's indexer query code ·
copying `VotingSidebar` quorum math (only `willProposalPass` is authoritative) · SSR-ing the SPA (`daoships-www`
already is) · WebMCP / A2A / x402 / ERC-8004 / ERC-7715 / agents.json (documented as constraints, not built).

---

## 5. Audit response — status

The original 15 CRITICAL + 28 HIGH dispositions stand; several have since **shipped** rather than merely being
planned:

- **Shipped:** C1/C3 (per-chain `deployments.ts`), C4 (RPC URL + `eth_chainId` gate), C11 (`governanceConfig` doc), C12 (`deriveProposalStatus` Defeated), C13 (ABI sync), C8 (deep-link hardening), H11/H23 (`tsc -b` + CI + unconditional Phase A), H16 (`willProposalPass` throws), H17 (no `'0x'` fallthrough).
- **Still open, now scoped above:** C7 (checksum rule — doc in B1), C14 (`assertActionSucceeded` — C2, layered on `confirmTx`), H1/H3/H4 (serving + `read-api.json` + versioning — B2/B3), H5/H10 (`Untrusted` typing + `::text` — C4), H9 (`parseSubmitReceipt`/`waitForIndexed` — C2), H12 (ABI normalization — B2), H25 (CID derivation — Phase A remnant), H8 (indexer `chain_id` — Phase A remnant), and the entire agent surface (B1–B3).
- **The error-dictionary breadth (Phase A / GasEstimator) is the one Phase-A item still open in `daoships-app` itself** — it decodes from `DAOShip.json` only today.

---

## 6. Sequencing

```
Probe        : crawler analytics + wizard instrumentation + 5 calls   [1d]  (runs in parallel)
Phase A rem. : error dictionary (16 ABIs) + poster validate + CID derive + indexer chain_id   [1d]
Phase B1     : /docs/agents SSR page                                  [2d]  (no code deps)
Phase B2     : gen-agent-pack + public/agent/v1 (uses deployments.ts, CI) [2d]  (needs Phase A CID fix)
Phase B3     : serving, deep-link already hardened, SECURITY.md, denylist  [1d]
Phase C1     : differential harness + encoder tests                   [2d]
Phase C2     : composed refusing ops, layered on TxExecutor           [1.5d] (needs C1)
Phase C3     : promote inline literals, sync mineSalts                [1d]  (feeds B2's launch-spec)
Phase C4     : Untrusted typing on the indexer services               [1d]
─────────────────────────────────────────────────────────────────────
                                                          Total ~11.5d
Phase D      : read-only MCP, ~8 tools, no signing        [3d]  CONDITIONAL on probe
Budgets page : /dao/:daoId/budgets rename + detection     [1d]  CONDITIONAL on probe
```

C3 emits the field descriptors B2 consumes; if C3 slips, `launch-spec.json` ships hand-authored with a TODO
rather than blocking B2 — the one accepted drift seam.

---

## 7. Open questions

1. **Confirm the `daoships-app-mainnet` Vercel env matches the `deployments.ts` mainnet column.** The one thing readable only by you; a disagreement is a live incident.
2. **Is the probe gate real?** If "ship Phase D regardless" is the answer, say so and it sequences into week 2 instead of gating behind analytics no one will honor.
3. **Ship `previewProposalStatus`'s `Defeated` result to the UI, or keep it internal?** It already returns `Defeated` (WP5); confirm the one live DAO's members should see proposals relabelled "Ready" → "Defeated" (correct, but visible).
4. **Freeze window for the contracts?** `specVersion` over a surface that has moved implies a compatibility promise; labelled `"0-unstable"`. If a redeploy is planned this month, B2 waits for it.
5. **`quorumPercent` warning floor.** Warn when `quorumPercent < 100` (under 1%)? Or do you have DAOs legitimately below it?

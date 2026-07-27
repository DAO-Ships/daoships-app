# DAOShips for AI Agents — Plan (re-baselined 2026-07-25)

> **Re-baseline note (2nd pass, 2026-07-25).** The 2026-07-24 pass marked off the shipped
> remediation. This pass corrects a **scoping error in the agent surface itself**: the plan
> specified a generated JSON "agent pack" (`public/agent/v1/`) on the assumption that agents
> needed us to publish ABIs, addresses, and specs. Verification (§0.5) shows all four repos are
> public, the ABIs and `deployment-addresses.json` are already fetchable at stable raw URLs, and
> `daoships-www` already carries 29 MDX doc pages including a happy-path
> `docs/developers/launch-from-typescript`. The pack was largely re-publishing public data and
> restating our own prose in JSON. It is cut. What replaces it is smaller and sharper: **two
> `llms.txt` files and one new doc page whose subject is silent failure.**
>
> The 2026-07-24 pass is preserved below in §0. The address model (§1) and read-access model (§2)
> are unchanged — they were never the stale parts.

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
| **Bonus infra the plan predates:** shared write path (`TxExecutor`: `executeWrite`/`confirmTx`/`TxReverted` + `TxTracker` record-before-await) | — | PR #4 (`refactor/write-path-and-service-split`) |
| Service decomposition: `dao/{DaoReadService,DaoWriteService,LaunchService,contracts,indexerGate}` + `core/navigators/*NavService` | — | SU3/SU4 — **merged to main 2026-07-27**, see note below |

> **Note on SU3/SU4 (2026-07-27).** Until today this row was inaccurate: the decomposition had
> never been merged. `refactor/su3-su4-service-decomposition` was pushed but **no PR was ever
> opened for it**, and `main` still carried the monolithic `DaoService.ts` with no `dao/` or
> `core/navigators/` directories. The confusion is understandable — PR #4 is titled
> *"Refactor/write path and service split"*, which sounds like the decomposition but delivered
> the write path (12 files, +759/−135) rather than SU3/SU4 (18 files, +2930/−2143). The branch
> was based on PR #4's merge commit, so it inherited `TxExecutor` and looked merged from the
> inside. It has now been merged directly to `main` and verified green: typecheck, lint
> (`--max-warnings 0`), 719 tests, production build.

### Phase A remnants (the genuinely-open bug fixes — ~1 day)

| Fix | Location | Why |
|---|---|---|
| Error dictionary decodes from **all 16 ABIs**, not just `DAOShip.json` | `src/services/utils/GasEstimator.ts:84` (`tryDecodeCustomError`) builds `new quais.Interface(DAOShipAbi)` at `:91` | "missing revert data" is the #1 human complaint; navigator/vault reverts don't decode today. Same map agents need. |
| Wire `validatePosterContent` before spending gas | `PosterService.ts.post()` (size guard present; schema validator `posterSchemas.ts:validatePosterContent` still dead) | Cheap pre-flight; posted metadata that the indexer will reject currently burns gas. |
| Navigator IPFS CIDs derived from CBOR metadata, not hand-copied | `NavigatorDeployService.ts:30-31` (8 `Qm…` literals) | H25 — derive via `@ethereum-sourcify/bytecode-utils` (already a dep); test asserts derived == shipped. |
| Indexer `chain_id` column | `daoships-indexer` (`mainnet.ds_indexer_state.chain_id` reports 15000 while indexing 9) | H8 — separate repo; verify + fix + `NOT NULL`. |

---

## 0.5 What verification changed (2026-07-25)

Four checks, all run against live hosts and the working tree. Each one removed scope.

| Check | Result | Consequence |
|---|---|---|
| Are the repos public? | **Yes, all four.** `api.github.com/repos/DAO-Ships/{daoships-app,-www,-contracts,-indexer}` → `200`. `raw.githubusercontent.com/.../src/config/abi/DAOShip.json` → `200`. | Publishing `abi/*.json` and `addresses.json` re-hosts data that is already fetchable at a stable URL. The pack's strongest bucket evaporates. |
| Do the contracts ship addresses? | **6 of 9.** `daoships-contracts/deployment-addresses.json` has `Poster`, both singletons, `DAOShipSingleton`, `DAOShipLauncher`, `DAOShipAndVaultLauncher`. Missing: `MultiSendCallOnly`, `QuaiVaultFactory`, `QuaiVault`. | All three missing values are reachable by §1's on-chain derivation walk. Addresses are a **documentation** problem, not a distribution problem. |
| Do agent-facing docs already exist? | **29 MDX pages**, including `docs/developers/{architecture,contracts,launch-from-typescript,indexer,frontend-integration,build-a-navigator}`. `launch-from-typescript` is 195 lines covering governance config → init params → salt mining → launch → submit → Poster. | **The happy path is already written.** A new `/docs/agents` page duplicating it would compete with it. The gap is elsewhere. |
| Is anything blocking crawlers? | **No.** `daoships-app/public/robots.txt` is `Allow: /`; `daoships-www/app/robots.ts` returns `{ userAgent: "*", allow: "/" }` + sitemap. Vercel serves `public/` files **before** rewrites, so `public/llms.txt` resolves without touching `vercel.json`. | No robots work needed. No serving work needed for `llms.txt` specifically. |

### The finding that reframes the deliverable

A catalogue of the app's own source comments (`BaseService.ts:10`, `contracts.ts:199`, `jsonBigInt.ts:1`,
`SaltMiner.ts:30`, `TxTracker.ts:11`, `paginate.ts:1`, `time.ts:132`, `validation.ts:10`, and ~80 more)
shows that the hard-won operational knowledge **is already written down — in public, in this repo.**

So the gap is not authorship. It is **addressing**.

An agent writing a standalone `quais.js` script reads the contracts — the obvious source of truth —
writes correct-looking code, and never opens `useProviderReady.ts` or `jsonBigInt.ts`. It then hits a
class of failure that produces **no exception to search on**:

- `BrowserProvider.getCode()` returns `'0x'` for *every* lookup on Pelagus → "that contract doesn't exist"
- PostgREST sends `NUMERIC` as a bare JSON number; 1000 shares = 1e21 → double → `"1e+21"` → `BigInt()` throws → **treasury balance renders 0**
- The retention veto returns `passed=false`, `actionFailed=false`, and a **status-1 receipt** → "executed successfully", on a permanently dead proposal
- `"2 weeks"` fails to parse → `null` → `0` → which is the contract's **USE-DEFAULT sentinel**, not an error
- Indexer list reads have no `.range()` upstream — past the cap, rows don't paginate, they cease to exist

An agent that hits a *loud* error will search GitHub and find the fix. An agent that gets a silent
wrong answer reports success. **That asymmetry is the entire remaining product.**

> **The new deliverable, stated once:** the agent doc page is not a tutorial and not a spec.
> It is an **index of silent failures**, curated from comments we have already written.

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
(fast path); the job is *verify cache == derivation* — which now lands as a test (§3, "Deployment gates")
rather than as a build-time generator.

Both networks are keyed `9` (Quai mainnet, Cyprus-1) and `15000` (Orchard testnet) in `deployments.ts`, every
address `quai_getCode`-verified and EIP-55-checksummed. The one residual is operational, not code: **confirm the
`daoships-app-mainnet` Vercel env matches the `deployments.ts` mainnet column** — if it disagrees, production is
running something other than what the contracts repo says, which is an incident, not a docs bug.

---

## 2. The read-access model (indexer)

Agents read the indexer over **Supabase PostgREST directly**, with the publishable key. This is a deliberate
default, not an oversight — but the decision axis is **availability, not secrecy**, and the two are easy to
conflate.

**The key is public by design.** `sb_publishable_*` is the same class as a Firebase web config: it is already a
plain string literal in the shipped `dist/assets/index-*.js`, so anyone with the app's bundle already has it.
Documenting it for agents discloses nothing new and grants nothing new — RLS enforces read-only at the database
(`FOR SELECT USING (true)`, `GRANT SELECT` only, `REVOKE EXECUTE ON ALL FUNCTIONS`; writes `401`). So "should we
hide the key behind an endpoint" is the wrong question — there is nothing to hide.

**The right question is: should agent reads share the human app's Supabase quota?** They currently would. The
plan already flags this for Realtime (project-level quota → agents told to poll, not subscribe), but PostgREST
request budget is *also* shared, and direct access gives us no per-consumer throttle, no isolation, and no
schema decoupling. An abusive or buggy agent fleet hammering PostgREST could degrade the one thing that matters —
the live app.

**Decision: direct PostgREST now; escalate only on a named trigger.** Building a hosted read API today is the
"any server" line item this plan lists as a non-goal, for a demand that is currently ~1 DAO and zero agents. The
escalation ladder, cheapest first:

1. **Dedicated agent key + Supabase-native rate limits.** Mint a *separate* publishable key (or a distinct
   restricted DB role) for agent traffic, so it can be throttled or revoked independently of the app's key —
   isolating the blast radius with **zero hosting**. Do this alongside the agent doc page.
2. **Read replica / separate connection pool** — only if agent reads measurably threaten app latency.
3. **Thin read-only edge proxy** (Vercel/Supabase Edge Function) — only if we also want to hard-decouple agents
   from the raw `ds_*` schema and do the `::text` casting + address checksumming + `Untrusted` marking
   server-side once, instead of documenting them. This is the "API endpoint" instinct; it is correct **when the
   trigger fires, not before.**

**Triggers that promote step 1 → step 3:** agent PostgREST volume measurably impacting app read latency, **or** a
scam-DAO / abuse burst where per-consumer throttling and a server-side denylist become worth the hosting. Absent
either, direct PostgREST with a dedicated agent key keeps the host-nothing default while naming the exact
condition under which the proxy becomes the right call.

---

## 3. Phased plan

**Remaining to end of Phase C: ~10.25 dev-days** (agent surface 5d → ~3.25d; Phase C untouched). Phase D is conditional.

### Phase A remnants — 1 day
The four fixes in §0's remnants table. Each is its own justification (they harm humans now); none blocks the agent program.

### Deployment gates — 0.5 day

The one piece of the cut generator worth rescuing, relocated from a build step into the existing vitest suite:

- every `deployments.ts` address returns non-empty `quai_getCode` on its own chain
- the seven derived addresses equal the §1 launcher walk
- every `rpcUrl` returns the declared `eth_chainId`
- `src/config/abi/*.json` matches `daoships-contracts/artifacts/`

This is a tripwire against the exact bug class that has already bitten us (a wrong `DAOSHIP_LAUNCHER` env →
silent launch reverts). It was the pack's genuine value; it does not need the pack to exist.

### Phase B — the agent surface (~3.25 days)

**B1 — `daoships-www/app/llms.txt/route.ts` → `daoships.org/llms.txt` (0.5d).** The canonical one.
Spec-shaped (H1, blockquote, prose, H2 link sections), with the link sections **generated from `lib/docs.ts`'s
`flatDocs`** so it cannot drift from the sidebar or the sitemap. Developers section emitted first.

Critically, it is **not purely a link index.** A chat model doing one fetch inside a turn will not walk links,
so the prose between the blockquote and the sections carries the highest-value traps *inline*, each pointing at
the agent page for detail. `llms.txt` must be useful standalone, because it may be the only fetch.

No `llms-full.txt` (unchanged non-goal).

**B2 — `daoships-app/public/llms.txt` → `app.daoships.org/llms.txt` (0.25d).** Short, and its job is
different. The app is a Vite SPA: every crawler fetch of `app.daoships.org/*` returns a JS shell with no
content. This file exists to say exactly that and redirect attention to `daoships.org/docs`, plus carry the two
hardcoded addresses per chain and the derivation rule, which are self-contained enough to be worth inlining.
Vercel serves `public/` before rewrites, so no `vercel.json` change is required.

**B3 — `daoships-www/app/docs/developers/agents/page.mdx` (1.5d).** The only genuinely new content.
Ordered by how *silent* the failure is, worst first:

1. **Silent failures** — the bulk of the page.
   `BrowserProvider.getCode()` → `'0x'` on Pelagus (use raw `quai_getCode`) · PostgREST `NUMERIC` → double →
   balance renders 0 · the retention veto (`passed=false`, `actionFailed=false`, **status-1 receipt** — a
   permanently dead *passing* proposal) · `processProposal` → `actionFailed` · `"2 weeks"` → `0` → the
   USE-DEFAULT sentinel · `"0.000…1"` → `0n` (founding member minted zero shares) · no `.range()` upstream, so
   rows past the cap cease to exist · `dao.profile` partial-update wiping banner/theme · `dao.navigators`
   omission de-sanctioning.
2. **Environment facts in no repo** — RPC is CORS-blocked from browsers (everything routes through the wallet) ·
   shard path mandatory, bare host 404s · `quai_*` rejects non-EIP-55 addresses outright · shardless
   `getBlock('latest')` → "Invalid shard", use local time with skew pad · `VAULT_SINGLETON` is owned by an
   external project and appears in no DAOShips repo.
3. **Key derivation** — `quais.QuaiHDWallet.createRandom()` + `getNextAddress(0, quais.Zone.Cyprus1)`; **not**
   `new Wallet(randomBytes(32))` (~0.2% valid); `quais`-only signing (viem/ethers cannot serialize a Quai
   protobuf tx); how to fund (state plainly if there is no faucet).
4. **The address model** — teach §1's derivation, not a table: *hardcode two, ask the chain for the rest.* The
   one checksum trap: `quais.Contract`/`AbiCoder` normalize lowercase but **raw `provider.getCode/call/getBalance`
   reject it** — `indexer row → raw provider method` needs `quais.getAddress(x)` first.
5. **Getting it wrong loudly** — `hashOperation` is `keccak256(abi.encode(txs))`, **not** `keccak256(txs)` ·
   `getPriorVotes(sender, now-1)`, not `getCurrentVotes` · `state(uint32)` is a free `eth_call` and is
   authoritative (`previewProposalStatus` is cache/UI-only) · the exact-data rule for `processProposal` (Ready
   needs the original bytes, Defeated needs `0x`) and why the failure surfaces as *"missing revert data"*.
6. **Reading the indexer** — `Accept-Profile`, the schema↔chain table, `::text` casts on numerics,
   `ds_indexer_state` gating, `trust_status='sanctioned'`, **every column untrusted by default**
   (`submitProposal` is `external payable` with no membership check, so anyone with gas writes arbitrary text
   into `ds_proposals.details` — the first field an agent reads).
7. **Glossary + where source lives** — `avatar` = vault = treasury · `ds_daos.id` = DAOShip address ·
   "Navigator" = plugin module · raw GitHub URLs for the ABIs and `deployment-addresses.json`, with the note
   that the latter is missing three addresses that §1 derives.

Add the page to `lib/docs.ts`'s `docsNav` under Developers — one line, which flows automatically into the
sidebar, the sitemap, and `llms.txt`.

**B4 — Edits to existing dev docs (0.5d).**
- `launch-from-typescript` — its salt section must state the **two-phase** requirement (the vault's initCodeHash
  embeds the predicted DAOShip address, so single-phase mining is impossible) and that the salt sender is the
  **launcher**, not the EOA.
- `indexer` — the `::text` / `quoteUnsafeIntegers` recipe and the pagination cap.
- `contracts` — link the derivation walk; note `deployment-addresses.json` omits `MultiSendCallOnly`,
  `QuaiVaultFactory`, `QuaiVault`.

**B5 — `SECURITY.md` in both repos (0.5d).** Abuse-report address + a one-page threat model: malicious DAO
poisoning agents; malicious agent griefing DAOs; compromised distribution; deep-link grammar weaponized against
humans.

**Also still worth doing, unrelated to agents:** `index.html`'s global
`<link rel="canonical" href="https://app.daoships.org">` collapses every `/dao/<addr>` to the homepage — make it
per-route or drop it.

### Phase C — Governance correctness, in-repo, **on the new infrastructure** (5.5 days)

Unchanged. This was never agent work — it is app correctness that happens to also serve agents. **No npm
package.** Zero external consumers, `quais` pinned at alpha, solo maintainer. Anti-drift is achieved by one
implementation imported by the app, and that implementation now has a home: the **`TxExecutor` write path** and
the **`dao/`/`navigators/` sub-services** from SU3/SU4.

- **C1 (2 days) — Differential harness for the governance predicates.** `src/types/proposal.ts` still has no
  direct test (`governanceParity`/`governanceBounds` cover the bounds, not a fuzz of the full status machine
  against a live contract). Fuzz proposal structs against a locally-deployed `DAOShip.state()`. Then tests for
  `ProposalEncoder`, `MultiSendEncoder`, `SaltMiner`, all still untested.
- **C2 (1.5 days) — Composed, refusing operations, layered on `TxExecutor`.**
  - `readProposalState(provider, dao, id)` — on-chain `state()` as the primitive; rename `deriveProposalStatus`
    → `previewProposalStatus` and document it cache/UI-only.
  - `buildProcessTx(...)` — resolves data, computes the branch, **cross-checks on-chain `state()` +
    `hashOperation()` and refuses on mismatch**, preflights the retention veto and refuses when the floor is
    breached. Belongs alongside `DaoWriteService.processProposal`, reusing its `executeWrite` gas-multiplier path.
  - `assertActionSucceeded(receipt)` — asserts **`passed === true && actionFailed === false`** with distinct
    errors. *Extends* `confirmTx`'s existing `TxReverted` check, which catches revert but not the status-1
    retention veto that leaves a passing proposal dead. Natural composition: `confirmTx` → `assertActionSucceeded`.
  - `parseSubmitReceipt(receipt) → {proposalId}` + `waitForIndexed(txHash)` — without these an agent that submits
    has no supported way to learn its id. (`DaoWriteService.submitProposal` already parses `SubmitProposal`;
    promote it to a shared exported helper.)
  - `capabilitiesOf(provider, dao, addr)` + `requiresProposal(action, caps)` over the permission bitmask.
  - `simulateLaunch(provider, params)` — plain `eth_call` of `launchDAOShipAndVault`; `calculateAllAddresses`
    verifies addresses only, not a malformed 13-field blob (the single likeliest launch error).
  - `assertUsableSigner(signer)` — throws unless `isQuaiAddress && zone === '0x00'`.
- **C3 (1 day) — Promote the inline literals.** The 13-field template moves out of `useLaunch.ts` into a named,
  exported, tested codec. `mineSalts()` becomes a plain sync function (~2000 keccaks, single-digit ms in Node —
  **no `worker_threads`**; the Web Worker stays a thin browser wrapper). *Note: with the pack cut, C3 no longer
  feeds a `launch-spec.json`, so the plan's one accepted drift seam is gone — C3 can slip freely.*
- **C4 (1 day) — Read-path hardening.** Type `ds_records.content_json`, `ds_proposals.details`,
  `ds_daos.name/description`, `ds_navigators.name`, and signal-poll labels as `Untrusted<string>`. Bake the
  `::text` + `quoteUnsafeIntegers` recipes into the `indexer/` services.

### Phase D — Read-only MCP, conditional (3 days)

Ship only if there is signal **or** the one live DAO's operator wants it. The plausible first user is a human
with Claude Code asking about their DAO — not an autonomous agent. `npx @daoships/mcp`, stdio, ~8 tools:

- `daoships_query({schema, table, filters, select})` — one tool, `::text` casting + checksumming + `Untrusted`
  baked in (not 14 near-identical wrappers; every tool def is context on every turn).
- `daoships_status` — indexer freshness (`requires_full_reindex` → **refuse, not warn**) + deployment verification.
- `build_launch / build_submit_proposal / build_process / build_vote / build_sponsor / daoships_simulate` —
  return `{chainId, to, value, data, gasLimit, serializeWith:"quais", warnings[], deepLink}` with **preflight
  refusals**: `build_submit_proposal` sets `value` to exactly `0n` or exactly `proposalOffering` via
  `min(sponsorThreshold, totalSupply)` + `getPriorVotes(self, now-1)`, enforces
  `expiration == 0 || expiration > now + votingPeriod + gracePeriod`; `build_sponsor` is **non-payable**;
  `build_vote` refuses while `block.timestamp <= votingStarts`; batch builders refuse any
  `disableModule(daoShip)` and reroute `setGovernanceConfig` → `queueChange` when a sanctioned GOVERNOR Timelock
  is active.

**No signing.** No key in a process that ingests attacker-authored `ds_proposals.details` — that is a
prompt-injection-to-signature pipeline, and `daoships_simulate` does not close it. If ever wanted, a separate
`@daoships/signer` CLI re-decodes the plan, resolves every address against `deployments.ts` + `trust_status`,
requires interactive confirm, and refuses `vault.enableModule` unconditionally.

---

## 4. Demand measurement (passive — no longer a gate)

The original 1-day probe gated a 5-day surface. With the surface at ~3.25 days, a 1-day gate costs a third of
what it protects. **Demote the probe from a gate to passive instrumentation**, and ship the docs regardless:

1. Analytics on `daoships-www` segmenting `GPTBot`/`ClaudeBot`/`PerplexityBot`/`Bytespider` + chat-host
   referrals, against the existing MDX docs and the new `/docs/developers/agents`.
2. Vercel request logs on `/llms.txt` (both hosts).
3. `LaunchWizard` step-transition instrumentation (already persists to `daoships-launch-form`).
4. Five direct conversations with Quai-ecosystem operators: what would you delegate to an agent?

**What it still gates: Phase D only.** Fewer than a stated threshold of crawler reads and zero integrator
conversations in 6 weeks → no MCP. Wizard drop-off on a specific step → human UX wins the next two weeks.

*(The draft's `SubscriptionNavigator.collectFee` probe remains rejected: it cannot fire — mainnet has 2
sanctioned navigators, both Onboarder/ERC20Tribute, and the only Subscription navigator is in the ephemeral
`dev` schema — and it would build an adversarial keeper network against our own users.)*

---

## 5. Explicit non-goals

**Newly cut (2026-07-25), with reasons:**

- **`scripts/gen-agent-pack.mts` and `public/agent/v1/`** — the generated pack in full. Its ABI/address payload
  re-hosts public data (§0.5); its `errors.json` / `governance-spec.json` / `read-api.json` / `launch-spec.json` /
  `salt-spec.json` restate our own prose in JSON, creating a second source of truth that must be kept in sync
  with the page the plan itself called canonical. The generator's **hard gates** survive as vitest tests
  (§3, "Deployment gates"); nothing else does.
- **`/agent/*` serving rules, `manifest.json`, `specVersion`, the `/agent/v1` → `/agent` 302** — all existed to
  serve the pack.
- **`public/agent/denylist.json`** — a scam-DAO lever with no scam DAOs and no agents. Revisit if the §2 abuse
  trigger fires.

**Carried forward unchanged:** `@daoships/protocol` npm package (extract when a second consumer exists) ·
`llms-full.txt` · hosted MCP / any server · **any signing, key custody, or relaying** · `AgentRegistry.sol` /
`daoships.dao.agents` tag · the drafted "Agent Budgets" (bundling `createBudget`+`enableModule` hides an
unbounded module grant — keep them separate; solve inert-navigator by detection) · `?spec=` launch deep link ·
`zod-to-json-schema` over `validation.ts` (constraints live in `.refine()`, which JSON Schema cannot express) ·
recommending Realtime to agents (project-level quota shared with the human app — recommend 30–60s polling) ·
granting anon `EXECUTE` on `ds_get_proposal_status` (`state()` on-chain is free + authoritative) · mirroring the
app's indexer query code · copying `VotingSidebar` quorum math (only `willProposalPass` is authoritative) ·
SSR-ing the SPA (`daoships-www` already is) · WebMCP / A2A / x402 / ERC-8004 / ERC-7715 / agents.json
(documented as constraints, not built).

---

## 6. Audit response — status

The original 15 CRITICAL + 28 HIGH dispositions stand; several have since **shipped** rather than merely being
planned.

- **Shipped:** C1/C3 (per-chain `deployments.ts`), C4 (RPC URL + `eth_chainId` gate), C11 (`governanceConfig`
  doc), C12 (`deriveProposalStatus` Defeated), C13 (ABI sync), C8 (deep-link hardening), H11/H23 (`tsc -b` + CI +
  unconditional Phase A), H16 (`willProposalPass` throws), H17 (no `'0x'` fallthrough).
- **Still open, now scoped above:** C7 (checksum rule — B3 §4), C14 (`assertActionSucceeded` — C2, layered on
  `confirmTx`), H5/H10 (`Untrusted` typing + `::text` — C4), H9 (`parseSubmitReceipt`/`waitForIndexed` — C2),
  H25 (CID derivation — Phase A remnant), H8 (indexer `chain_id` — Phase A remnant), and the agent surface
  (B1–B5).
- **Re-dispositioned by the pack cut:** H1/H3/H4 (serving, `read-api.json`, versioning) — these were audit
  findings *about the pack's design*. With no pack, H1 and H4 are moot; **H3's substance survives as B3 §6**
  (the indexer-reading rules become prose in the agent page rather than a generated JSON file).
- **The error-dictionary breadth (Phase A / GasEstimator) is the one Phase-A item still open in `daoships-app`
  itself** — it decodes from `DAOShip.json` only today.

---

## 7. Sequencing

```
Phase A rem. : error dict (16 ABIs) + poster validate + CID derive + indexer chain_id   [1d]
Deploy gates : on-chain address/ABI assertions as vitest tests                          [0.5d]
Phase B1     : llms.txt route on daoships-www (generated from flatDocs)          ✅ SHIPPED
Phase B2     : public/llms.txt on daoships-app                                   ✅ SHIPPED
Phase B3     : docs/developers/agents — the silent-failure index                 ✅ SHIPPED
Phase B4     : edits to launch-from-typescript, indexer, contracts               ✅ SHIPPED
Phase B5     : SECURITY.md in both repos                                         ✅ SHIPPED
Phase C1     : differential harness + encoder tests                                     [2d]
Phase C2     : composed refusing ops, layered on TxExecutor                             [1.5d]  (needs C1)
Phase C3     : promote inline literals, sync mineSalts                                  [1d]
Phase C4     : Untrusted typing on the indexer services                                 [1d]
──────────────────────────────────────────────────────────────────────────────────────
                                                    Phase B COMPLETE · Remaining ~6.5d
Phase D      : read-only MCP, ~8 tools, no signing        [3d]  CONDITIONAL on §4
Budgets page : /dao/:daoId/budgets rename + detection     [1d]  CONDITIONAL on §4
```

### Shipped 2026-07-25

| Artifact | Notes |
|---|---|
| `daoships-www/app/llms.txt/route.ts` | Link sections generated from `lib/docs.ts`; twelve pitfalls inline; `force-static`. Application hostnames are **literals, not `site.appUrl`** — that value is env-overridable and `.env.local` points it at testnet, which would have shipped an `llms.txt` naming the testnet as canonical. |
| `daoships-app/public/llms.txt` | Static; Vite's default `publicDir` + Vercel serving `public/` ahead of the SPA rewrite means no `vercel.json` change. Carries the derivation walk and the two hardcoded addresses per chain, cross-checked against `deployments.ts`. |
| `daoships-www/app/docs/developers/agents/page.mdx` | The silent-failure index. Every claim verified against source before publication (see below). |
| `daoships-www/lib/docs.ts` | One `docsNav` entry + search keywords; flows into sidebar, sitemap, and `llms.txt`. |

**Verified during authoring** (worth recording, because several were stated loosely in earlier
drafts of this plan): `ProcessProposal(uint256 proposal, bool passed, bool actionFailed, address
processor)` · `state(uint32) → uint8` with enum order `Unborn, Submitted, Voting, Cancelled,
Grace, Ready, Processed, Defeated, Expired` (note **Cancelled=3, Grace=4** — the contract order is
*not* the indexer's, and the contract has no `ActionFailed` member) · `getProposalStatus(uint32) →
bool[4]` = `[cancelled, processed, passed, actionFailed]` · the retention veto's exact form and
the fact that `STATUS_PROCESSED` is set *before* it is evaluated, so a vetoed proposal is
terminal and `state()` reports `Defeated` · `keccak256(abi.encode(proposalData))` with the
Defeated-must-be-empty branch.

**One correction the page bakes in:** "`state()` is authoritative" — as this plan repeatedly said —
is true for *lifecycle position* but **false for execution outcome**. A proposal whose action
reverted keeps `STATUS_PASSED` and so reports `Processed`. Execution outcome requires
`getProposalStatus(id)[3]` or the event. C2's `assertActionSucceeded` must not be built on
`state()` alone.

### Shipped 2026-07-27 (B4, B5) — and what the audit of the existing docs found

B4 was scoped as "add three notes to existing pages." Verifying each claim before writing it
turned up **three live documentation bugs**, all of which would break a reader following the docs
exactly. None were in the new agent page; all were in pages that predate this plan.

| Bug | Where | Effect |
|---|---|---|
| **`sender` documented backwards.** The page said *"the `sender` you mined against **must** equal the transaction sender"* and shipped `mineSalts(await signer.getAddress())`. | `launch-from-typescript` §3–4 | At deploy time `msg.sender` to both factories is `DAOShipAndVaultLauncher` (`DAOShipAndVaultLauncher.sol:139` passes `address(this)`), not the EOA. Following the doc mines four `0x00` addresses and then deploys to four different ones. **Every launch built from this page would fail.** |
| **Two non-functional RPC URLs.** `https://rpc.quai.network` (404) and `https://rpc.orchard.quai.network` (does not resolve). | `contracts` → Networks table | Nothing built from the table connects. Corrected to the shard-pathed forms and verified: `quai_chainId` → `0x9` / `0x3a98`. |
| **The NUMERIC section was factually inverted.** It claimed `NUMERIC(78,0)` "come back as **strings** … to avoid precision loss" and recommended `BigInt(String(x))`. | `indexer` | The live API returns bare JSON numbers — verified: `"total_shares":3000000000000000000000`. Both recommended coercions are broken: `BigInt(parsed)` is silently wrong (`1234567890123456789012` → off by 14,868 wei), and `BigInt(String(parsed))` **throws** at ≥1e21 (`Cannot convert 3e+21 to a BigInt`). Rewritten around `::text` at the query, which is the only fix. |

Also added: the two-phase / per-factory salt-packing constraint (on the callout that recommends
local prediction, since `calculateAllAddresses` resolves the ordering on-chain and the constraint
only bites a local reimplementation); PostgREST's bounded-window behaviour with the
`Prefer: count=exact` recipe and the single-use-builder trap; the derivation walk and the
`deployment-addresses.json` omissions in `contracts`.

**B5:** `SECURITY.md` in both repos, routed to **GitHub private vulnerability reporting** (needs
enabling per repo under Settings → Security). The app's carries the four-scenario threat model;
the www one treats *a published address that does not match the deployment the app uses* as a
security bug rather than a typo — which the finding below makes concrete.

B1–B5 have no code dependencies and can run in any order, or in parallel with Phase C. The Phase A CID fix is no
longer a prerequisite for anything in B (it was a prerequisite for the pack's `bytecode/*.json`); it remains
worth doing on its own merits.

---

## 8. Open questions

1. ~~**Confirm the `daoships-app-mainnet` Vercel env matches the `deployments.ts` mainnet column.**~~
   **RESOLVED 2026-07-25 — confirmed matching.** Production runs what the contracts repo says. The
   "Deployment gates" vitest suite should now lock this in so it stays true without a manual check.
2. **Ship `previewProposalStatus`'s `Defeated` result to the UI, or keep it internal?** It already returns
   `Defeated` (WP5); confirm the one live DAO's members should see proposals relabelled "Ready" → "Defeated"
   (correct, but visible).
3. **Freeze window for the contracts?** Less pressing now — with no `specVersion` and no pack, there is no
   implied compatibility promise, so a redeploy costs a doc edit rather than a versioned artifact migration.
4. **`quorumPercent` warning floor.** Warn when `quorumPercent < 100` (under 1%)? Or are there DAOs legitimately
   below it?
5. **Dedicated agent Supabase key** (§2 step 1) — mint now alongside B3, or wait for measured agent traffic?

6. **The docs' "Orchard Testnet" column is the `dev` environment, not testnet.** *(Open — left
   unchanged by request 2026-07-27. Addresses are still the original set; the dead RPC URL was
   fixed.)*

   Three distinct, internally-coherent DAOShips deployments exist on Orchard (chain 15000). All
   six DAOShips-owned addresses differ between them; all three share the same Quai Vault infra
   (`QuaiVaultFactory` `0x002d1305…`, `MultiSendCallOnly` `0x002ae8A4…`), which is why the vault
   rows in the docs table looked correct and masked the rest.

   | Set | `DAOShipAndVaultLauncher` | `DAOShipSingleton` | Where it lives |
   |---|---|---|---|
   | **A** | `0x0030d87f…Bfb6dD` | `0x004c1BCD…68dd9` | `daoships-app/.env` (local, `VITE_NETWORK_SCHEMA=dev`) **and published by the docs as "Orchard Testnet"** |
   | **B** | `0x0036B11e…FC9D1` | `0x0034B574…4002C` | `deployments.ts` testnet column → `testnet.daoships.org` |
   | **C** | unidentified | `0x000f38dc…9fe03` | the singleton all 3 DAOs in the indexer's **`testnet`** schema are clones of |

   Verified by walking `.daoShipLauncher()` / `.quaiVaultFactory()` / `.multisendCallOnly()` on
   each launcher and by reading the ERC-1167 implementation out of each indexed DAO's bytecode.

   The docs column was evidently transcribed from a local `.env` — it carries that file's address
   set *and* its broken `VITE_RPC_URL=https://rpc.orchard.quai.network`, which does not resolve.
   So the published "Orchard Testnet" addresses point at a private dev deployment.

   Two things to reconcile, both operational rather than code:
   - **Which set is canonical for testnet?** If B, the docs column should become B. (A is dev; it
     arguably should not be published at all.)
   - **Why does the `testnet` schema contain set-C DAOs?** Either those three DAOs predate a
     redeploy that updated `deployments.ts`, or the indexer is watching a launcher that neither
     the app nor the docs reference. The first is benign history; the second means testnet reads
     and writes disagree.

   Also worth fixing regardless: `daoships-app/.env` has a dead `VITE_RPC_URL`. Mainnet is
   unaffected throughout — the docs' mainnet column matches `deployments.ts` on all nine
   addresses, and the Vercel env was confirmed matching (question 1).

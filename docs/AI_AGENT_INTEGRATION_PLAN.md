# DAOShips for AI Agents — Final Plan

## 1. Current-state assessment

### What an agent can do today, with zero work from us

| Capability | How | Evidence |
|---|---|---|
| Read every DAO, proposal, member, vote, navigator, budget, vesting row | Supabase PostgREST, `apikey: sb_publishable_AlBdyussC55cUYHOQ_0dsw_8o7wYdoB`, `Accept-Profile: mainnet\|testnet\|dev` | `src/config/supabase.ts:15-17,55-70`; verified live 200s on all three schemas |
| Read chain state directly | `https://rpc.quai.network/cyprus1` — **verified live: `eth_chainId` → `0x9`, CORS `access-control-allow-origin: *`** | Verified this session |
| Subscribe to changes | Supabase Realtime, 17 tables, anon-readable | `daoships-indexer/supabase/migrations/schema.sql:1647-1690` |
| Call every permissionless contract function | `submitProposal`, `sponsorProposal`, `submitVote(s)`, `processProposal`, `cancelProposal`, `ragequit`, `onboard`, `payFee`, `collectFee`, `createPoll`, `executeChange`, `Poster.post` | `daoships-contracts/contracts/core/DAOShip.sol:894,964,1008,1019,1070,1163,1552` |
| Hand a human a prefilled proposal | `/dao/:daoId/proposals/new?type=custom&customTo=…&customData=…` | `src/utils/customActionHref.ts:24-35`; `src/pages/dao/NewProposal.tsx:135-165` |

**The read API is already public and read-only-enforced.** RLS on every `ds_*` table, `FOR SELECT USING (true)`, `GRANT SELECT` only, `REVOKE EXECUTE ON ALL FUNCTIONS` (`schema.sql:1512-1634`). Writes 401. The publishable key is already a string literal in `dist/assets/index-*.js`. Publishing it discloses nothing.

### What an agent cannot do, in order of how early it fails

> **Scope correction (verified this session).** The working assumption is that agents run **quais.js directly with their own wallet**. I tested that end-to-end in headless Node against mainnet, and the transport layer is a solved problem — see §1.4. Items 1-2 below were transport hazards in the draft; they are now one-line doc notes. The real blockers are 3-5, which are all **domain knowledge**, not plumbing. That shifts the plan's centre of gravity from "hazard warnings" to "specs."

1. ~~**Exist.**~~ **Solved by the SDK.** `quais.QuaiHDWallet.createRandom()` + `getNextAddress(0, quais.Zone.Cyprus1)` returns a valid Cyprus-1 address deterministically, first try — verified (`0x0033CB2A…`, `isQuaiAddress: true`, `zone: 0x00`). The "~0.2% of random keys" statistic is only true for `new Wallet(randomBytes(32))`, which no quais agent would write. Note: `quais.Wallet.createRandom` genuinely does not exist, so the *one* thing worth documenting is "use `QuaiHDWallet`, not `Wallet`."
2. ~~**Broadcast.**~~ **Solved by the SDK.** Verified: `hd.signTransaction(new quais.QuaiTransaction(...))` produces a 111-byte protobuf payload that round-trips through `QuaiTransaction.from()` with `from` matching the signer. Headless `quais.JsonRpcProvider('https://rpc.quai.network/cyprus1', undefined, {usePathing:true})` reports `chainId: 9` with no CORS involvement. The finding that survives is narrow and worth one sentence: **viem/ethers cannot serialize a Quai transaction, so use quais** — not a blocker, a library choice.
3. **Find the right contracts.** There is no per-chain address map anywhere — `CONTRACT_ADDRESSES` is one flat env-resolved object whose hardcoded defaults are the **Orchard** set. See §1.5: the addresses are all recoverable and correct, but they are split across two repos plus Vercel env, and no single artifact states which chain a given address belongs to. An agent has nothing authoritative to read.
4. **Encode a launch.** The 13-field `initializationParamsTemplate` (`src/hooks/useLaunch.ts:57-89`), the nested 7-field bps `governanceConfig` (`src/services/utils/GovernanceEncoder.ts:40-73`), the two-phase CREATE2 salt derivation with `msg.sender = DAOShipAndVaultLauncher` (`src/services/utils/SaltMiner.ts:12-35`), the per-navigator IPFS CIDv0 required as quais' 4th `ContractFactory` arg (`src/services/core/NavigatorDeployService.ts:28-45`) — none derivable from any ABI.
5. **Process a proposal correctly.** `keccak256(abi.encode(data))` not `keccak256(data)`; Ready needs exact bytes, Defeated needs `0x`; and — found by audit — our own `deriveProposalStatus` **never returns Defeated**, so an agent following it reverts `HashMismatch` on every failed proposal.

### The two facts that reframe the whole effort

**The docs an LLM actually reads are already published, and one field is wrong.** `daoships-www` is SSR Next.js — the only DAOShips surface readable without JS. `app/docs/developers/launch-from-typescript/page.mdx` already documents the template, the salts and `minExecutionDelay=0`, and its MULTISEND address is **correct and correctly labelled `(mainnet)`**. The one defect: it encodes a **6-field** `governanceConfig` (page.mdx:26-34) against the contract's 7 — verified at `DAOShip.sol:605`, `abi.decode(_governanceConfig, (uint32,uint32,uint256,uint256,uint256,uint256,uint32))`. The missing trailing `defaultExpiryWindow` makes `abi.decode` revert, so **every agent that follows this page fails at DAO init**. One-line fix, highest-leverage line in the plan. Any artifact we build inside the JS-only SPA is invisible next to this page.

**Demand is ~1 live mainnet DAO on a chain no 2026 agent framework can reach.** No viem/ethers path, no ERC-4337, no bundler, no ERC-8004 registry. The honest effort ceiling is **~3 weeks**, and most of that is work worth doing whether or not a single agent ever shows up.

### 1.4 What a quais.js agent gets for free (verified in headless Node, mainnet)

| Capability | Result | Consequence for the plan |
|---|---|---|
| Cyprus-1 wallet | `QuaiHDWallet.createRandom()` + `getNextAddress(0, Zone.Cyprus1)` → valid first try | Key-grinding docs: **cut** to one line |
| Headless RPC | `JsonRpcProvider(rpc, undefined, {usePathing:true})` → `chainId 9` | CORS is browser-only, as suspected. **No proxy, no backend needed** |
| Offline signing | `signTransaction()` → 111-byte protobuf, round-trips, `from` matches | No relayer, no custody, no server. Agent is fully self-sufficient |
| Contract reads | `new quais.Contract(addr, abi, provider)` works, **and normalizes a lowercase target** | Indexer rows can be fed straight into `Contract` |
| ABI encoding | `AbiCoder` accepts lowercase **and** checksummed; rejects *mixed-case-but-wrong* | Lowercase indexer addresses are safe as call arguments |
| Raw provider calls | ⚠️ `provider.getCode(lowercase)` → **`address has invalid checksum`** | The one real checksum trap — see below |

**The surviving checksum hazard is narrower than the audit claimed, and precisely locatable.** `quais.Contract` and `AbiCoder` normalize for you; **raw provider methods do not** — `provider.getCode/getBalance/call` pass the string through and the node rejects it. Since every address the indexer returns is lowercase, the exact failing pipeline is `indexer row → provider.getCode(...)`. Fix is one line, `quais.getAddress(x)`, and it belongs in the docs as a specific rule, not a vague "checksum your addresses."

**The strategic consequence:** transport, custody, signing, and encoding are all solved by a library the agent already imports. Nothing in this plan should re-implement them, and no hosted component is needed for an agent to be fully autonomous. What agents actually lack is **the domain layer** — which addresses, which field order, which salt predicate, which proposal branch, whether a proposal will pass. That is exactly what Phases B and C produce, and it is the correct place to spend every remaining day.

### 1.5 Verified deployment ground truth

Every address below was verified this session by `quai_getCode` against the network's own RPC. Both RPCs self-report correctly: `rpc.quai.network/cyprus1` → `0x9`, `orchard.rpc.quai.network/cyprus1` → `0x3a98` (15000).

| Contract | Mainnet (chainId 9) | Orchard (chainId 15000) | code len |
|---|---|---|---|
| Poster | `0x004Db03AA2593B4885AFEFF688ca2634D1533fac` | `0x005C3957b8f612BBcdCFCbeDb8C53C3d3b3FEEdc` | 930 |
| SharesERC20Singleton | `0x0019d1FcdB7Aa83aCD17a5484f3246d1959d38fF` | `0x00366CedcB0B99A9E5Dfb9B7dE1484A895118235` | 18652 |
| LootERC20Singleton | `0x0059458879E8f1FCA65f3068d9BC587b0Fd81286` | `0x00521258bBD3B23Bc10c3Fc77d360Df4379dE054` | 11658 |
| DAOShipSingleton | `0x002956ba6223d17b67Af509bb057928299B11611` | `0x0034B574bDC240d37b6F08248Ae069727164002C` | 44064 |
| DAOShipLauncher | `0x001aa208480e8495067217c5238913dF1eC683d7` | `0x00487182EA7a7881d84C63099001B0195a41BFB3` | 7756 |
| DAOShipAndVaultLauncher | `0x0067b50Dac689d8688eF8575B82Bc663802f3AF5` | `0x0036B11eEC6aa17407b0e157fA9caa32b7EFC9D1` | 9492 |
| QuaiVaultFactory | `0x003613aC5FFd45bFF7B2F0210DA2fF660908c488` | `0x002d1305D597c157bB975967FA2e5337674b0E5F` | 12602 |
| MultiSendCallOnly | `0x003f62e6a7f2EB6b94345a9A41671888eC4A3ebA` | `0x002ae8A47C2da497fe569AfCF0486410aA1093E0` | 1356 |
| QuaiVault singleton | `0x0038E6d84412A10CdcE41b0f62A05350023f1fb6` | `0x004E539Cf477A5Cb456A56023f083cD91Bc4934e` | 42980 |

**Bytecode length matches pairwise across all nine rows** — the same contract versions are deployed on both networks. Nothing is stale; the two sets are simply two networks.

Provenance, and why this was hard to see:
- **Mainnet 1-6** are in `daoships-contracts/deployment-addresses.json` (`chainId: "9"`).
- **Mainnet QuaiVaultFactory + MultiSendCallOnly** are in the `references` block of `deployments/deployment-complete-cyprus1-1784667245618.json` — present, but *not* in the top-level file, which is why they looked missing.
- **The QuaiVault singleton is in no repo at all.** It is external infra (the QuaiVault project; this repo has only `IQuaiVaultFactory.sol` and a mock). It is recovered at runtime by `factory.implementation()` — selector `0x5c60da1b`. Method validated on Orchard: the factory returns exactly the `VAULT_SINGLETON` in `contracts.ts`. **This is the only value with no static source, and the generator must read it from the chain, not a file.**
#### 1.5b The launcher is a self-describing root of trust — publish 2 addresses, not 18

Verified live on mainnet: starting from **one** address, `DAOShipAndVaultLauncher`, a quais agent derives eight of the nine:

```
DAOShipAndVaultLauncher (root, published)
├── .daoShipLauncher()    → DAOShipLauncher
│     ├── .daoShipSingleton() → DAOShipSingleton
│     ├── .sharesSingleton()  → SharesERC20Singleton
│     └── .lootSingleton()    → LootERC20Singleton
├── .multisendCallOnly()  → MultiSendCallOnly
└── .quaiVaultFactory()   → QuaiVaultFactory
      └── .implementation()   → QuaiVault singleton
```

Run against chain 9 this session, this reproduced **every mainnet address in the table above, exactly**. Only **Poster is unreachable** from the graph — it is standalone infra with no back-reference.

This collapses the whole address-distribution problem. Instead of publishing and maintaining an 18-cell table that drifts the moment anything is redeployed, publish **two addresses per chain** (`DAOShipAndVaultLauncher` + `Poster`) and let agents derive the rest at call time from the chain itself. Drift becomes structurally impossible rather than CI-policed, which is a strictly stronger answer to audit findings C1, C2, H2 and H7 than the gate they proposed. The full table stays in `deployments.ts` as a **cached assertion** — fast path for the app, and the generator's job becomes *verify cache == derivation*, not *transcribe a file*.

- **`src/config/contracts.ts` defaults are the complete, live, correct Orchard set** — all nine verified. They are *not* stale. The real defect is that they are labelled "cyprus1 ... chain ID 15000" (`contracts.ts:6-7`) while `deployment-addresses.json` says cyprus1 is chainId 9, so the word "cyprus1" names both networks in two repos. Mainnet correctness therefore rests entirely on the `daoships-app-mainnet` Vercel env vars, with no committed artifact to diff against.

---

## 2. Day 1 — smallest useful slice (1 day)

Not the generator. The generator cannot run (audit-confirmed: `import.meta.env` is undefined under Node and `tsx` is not a dependency).

**Fix the one field that breaks every agent, and commit the per-chain address map that §1.5 established.** No longer blocked on anything — all nine mainnet addresses are verified and in hand.

1. `daoships-www/app/docs/developers/launch-from-typescript/page.mdx` — change the `governanceConfig` example from 6 fields to 7 by appending `'uint32'` + a `defaultExpiryWindow` value (the doc's basis-point Callout is already correct, and its MULTISEND address is already correct — **leave both alone**), and add a one-paragraph "before you start" block:
   - Your EOA must be Cyprus-1. Use `quais.QuaiHDWallet.createRandom()` + `getNextAddress(0, quais.Zone.Cyprus1)`. A random key works ~0.2% of the time.
   - RPC is `https://rpc.quai.network/cyprus1` — the shard path is mandatory (verified: bare host 404s).
   - Only `quais` can serialize a Quai transaction. viem/ethers cannot.
2. `daoships-contracts/deployment-addresses.json` — restructure to `{ "9": {...}, "15000": {...} }` using the nine verified addresses in §1.5, folding in the `references` block (QuaiVaultFactory, MultiSendCallOnly) that is currently only in the timestamped deployment file, plus `quaiVaultSingleton` annotated as *derived from `factory.implementation()`, not deployed by this repo*. This becomes the single per-chain source of truth for all three repos.
3. `daoships-contracts/README.md` — fix the 6-field `governanceConfig` example; delete the Live Deployment address table and link to `deployment-addresses.json`.
4. **Diff the `daoships-app-mainnet` Vercel env against §1.5** and reconcile. This is the one step needing your hands — everything else is now determined. If the env vars disagree with the verified mainnet column, the env vars are what production is actually running and the discrepancy is a live incident, not a docs bug.

Cost: 1 day, no new tooling, no new files in the SPA. Item 1 alone unbreaks every agent that follows the published guide.

---

## 3. Phased plan

Total to the end of Phase C: **~15 dev-days.** Phase D is conditional.

### Phase A — Unconditional bug fixes (4 days, ships regardless of the agent bet)

These are live defects harming humans now. They are **not** prerequisites for an agent program; they are their own justification. If the agent program is killed tomorrow, Phase A still ships.

| Fix | File | Why |
|---|---|---|
| Make `tsc` actually run | `package.json` — `"build": "tsc -b && vite build"`, add `"typecheck": "tsc -b"` | `tsconfig.json` is `{files:[],references:[…]}`; bare `tsc` is a **no-op**. 50 real errors are live, incl. `SubscriptionPlugin.tsx:589 Cannot find name 'parseTokenAmount'` — a shipped runtime `ReferenceError`. Drive to zero. |
| Launch token-pause flags | `LaunchWizard.tsx:369-370` ↔ `useLaunch.ts:22-23` | `sharePaused`/`lootPaused` vs `pauseSharesOnLaunch`/`pauseLootOnLaunch` → both reach AbiCoder as `undefined`, silently encoded `false`. |
| Funding decimals | `NewProposal.tsx:350`, `BudgetPlugin.tsx:427`, `TransactionBuilder.tsx:261,509,727`, `FundingForm.tsx` | `quais.parseQuai()` hardcodes 18 decimals everywhere. A 6-decimal ERC-20 proposal encodes 10¹² × too much. Add a shared `scaleTokenAmount(token, human, provider)` that reads `decimals()` on-chain and **refuses** when the call fails. |
| Delete `LauncherService.ts` | `src/services/core/LauncherService.ts` | Zero importers; second divergent launcher-address source. Exactly `feedback_env_validation`. |
| On-chain proposal fallback | `DaoService.ts:1084` | Never writes `max_total_shares_at_sponsor`, so `willProposalPass` sees `'0'` → quorum threshold 0 → **every yes>no proposal predicted Ready** during an indexer outage → wrong-branch `HashMismatch`. Add the field; make `willProposalPass` **throw** when `quorumBps > 0` and the snapshot is absent. |
| `processData` fallback | `ProposalDetail.tsx:181` | `proposal.proposal_data ?? '0x'` sends `0x` on the Ready branch when data is missing → guaranteed `HashMismatch`. Throw instead. |
| `deriveProposalStatus` ≠ contract | `src/types/proposal.ts:137-183` | Three divergences from `DAOShip.sol:761-790`: (a) never returns `Defeated` past grace; (b) returns `Submitted` for an expired-unsponsored proposal; (c) applies M-7 auto-expiry to failing proposals the contract keeps `Defeated`. Fix all three. |
| Poster pre-flight validation | `PosterService.ts:49-67` | Call `validatePosterContent` (`src/utils/posterSchemas.ts:77-128`, currently dead code) before spending gas. |
| Sync stale ABIs | `src/config/abi/DAOShip.json` | Missing `InsufficientProcessGas()` and `TooManyGuildTokens()` vs the compiled artifact (53 vs 55 errors). The app cannot decode "raise your gas limit" today. |
| Indexer chain_id | `mainnet.ds_indexer_state.chain_id` | Reports `15000` while indexing chain 9 (verified live). Make the column `NOT NULL` with no default; write it explicitly at startup. |
| Surface the error dictionary in the UI | `TransactionErrorHandler`, `GasEstimator.ts:20-51` | Build the decoding `Interface` from **all 16 ABIs**, not just `DAOShip.json`. "missing revert data" is the #1 human complaint and the fix is the same map agents need. |

**Also in Phase A: stand up CI.** There is no `.github/workflows` in any of the three repos. Add one workflow to `daoships-app`: `typecheck` + `vitest run` + `lint`. Every later gate in this plan assumes it. **0.5 day, counted above.**

**Explicitly NOT in Phase A:** reconciling `posterSchemas.ts`'s stricter UI limits with the indexer's authoritative ones. Wire the validator in; leave the limits.

### Phase B — Correct the published surface (5 days)

**Precondition (0.5 day):** `src/config/deployments.ts` — a plain-data, zero-import, no-`import.meta.env` module:

```ts
export const DEPLOYMENTS = {
  9: {
    chainName: 'Quai Network', rpcUrl: 'https://rpc.quai.network/cyprus1',
    explorerUrl: 'https://quaiscan.io', supabaseSchema: 'mainnet', deploymentEpoch: 1,
    contracts: {
      POSTER:                     '0x004Db03AA2593B4885AFEFF688ca2634D1533fac',
      SHARES_SINGLETON:           '0x0019d1FcdB7Aa83aCD17a5484f3246d1959d38fF',
      LOOT_SINGLETON:             '0x0059458879E8f1FCA65f3068d9BC587b0Fd81286',
      DAOSHIP_SINGLETON:          '0x002956ba6223d17b67Af509bb057928299B11611',
      DAOSHIP_LAUNCHER:           '0x001aa208480e8495067217c5238913dF1eC683d7',
      DAOSHIP_AND_VAULT_LAUNCHER: '0x0067b50Dac689d8688eF8575B82Bc663802f3AF5',
      QUAIVAULT_FACTORY:          '0x003613aC5FFd45bFF7B2F0210DA2fF660908c488',
      MULTISEND_CALL_ONLY:        '0x003f62e6a7f2EB6b94345a9A41671888eC4A3ebA',
      VAULT_SINGLETON:            '0x0038E6d84412A10CdcE41b0f62A05350023f1fb6', // = factory.implementation()
    },
  },
  15000: {
    chainName: 'Orchard', rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
    explorerUrl: 'https://orchard.quaiscan.io', supabaseSchema: 'testnet', deploymentEpoch: 1,
    contracts: {
      POSTER:                     '0x005C3957b8f612BBcdCFCbeDb8C53C3d3b3FEEdc',
      SHARES_SINGLETON:           '0x00366CedcB0B99A9E5Dfb9B7dE1484A895118235',
      LOOT_SINGLETON:             '0x00521258bBD3B23Bc10c3Fc77d360Df4379dE054',
      DAOSHIP_SINGLETON:          '0x0034B574bDC240d37b6F08248Ae069727164002C',
      DAOSHIP_LAUNCHER:           '0x00487182EA7a7881d84C63099001B0195a41BFB3',
      DAOSHIP_AND_VAULT_LAUNCHER: '0x0036B11eEC6aa17407b0e157fA9caa32b7EFC9D1',
      QUAIVAULT_FACTORY:          '0x002d1305D597c157bB975967FA2e5337674b0E5F',
      MULTISEND_CALL_ONLY:        '0x002ae8A47C2da497fe569AfCF0486410aA1093E0',
      VAULT_SINGLETON:            '0x004E539Cf477A5Cb456A56023f083cD91Bc4934e', // = factory.implementation()
    },
  },
} as const
```

Every address above is `quai_getCode`-verified on its own chain (§1.5) and stored EIP-55-checksummed, because `quai_*` rejects non-checksummed input. `contracts.ts` becomes `DEPLOYMENTS[CHAIN_ID].contracts`, env override retained for local dev only. This is what makes a generator possible at all — and it is now a **transcription** task, not a discovery one.

**Generator gate, revised per §1.5b — derive, don't transcribe.** For each chain the generator takes only `DAOSHIP_AND_VAULT_LAUNCHER` + `POSTER` as trusted input, walks the launcher graph on-chain (`daoShipLauncher` → singletons; `multisendCallOnly`; `quaiVaultFactory.implementation()`), and **asserts the derived set equals the cached table**, failing the build on any mismatch. This subsumes the `codeHash` gate for the seven derived addresses — they cannot be wrong without the launcher itself being wrong. Keep an explicit `eth_getCode` + `codeHash` check on the two roots, which have nothing above them to vouch for them.

`/docs/agents` should teach the derivation, not the table: **"hardcode one address, ask the chain for the rest."** An agent that does this is immune to every redeploy that keeps the launcher stable, and needs no artifact from us at all.

**B1 — `daoships-www/app/docs/agents/page.mdx` (2 days).** ONE server-rendered page, the primary agent read path, because a chat model doing one fetch inside a turn will not walk a 10-file link index. Sections, in order:

1. **Before you start** — Cyprus-1 key derivation; `quais`-only signing; shard-pathed RPC; how to fund (state plainly if there is no faucet).
2. **Silent failures** — first, not last. `ProcessProposal.actionFailed`; `passed=false` from the retention veto (see below); Poster truncation; `dao.profile` partial-update wiping banner/theme; `dao.navigators` omission de-sanctioning.
3. **Governance state machine** — the contract enum verbatim (`DAOShip.sol:228-238`), the rule that **`state(uint32)` is a free eth_call and is authoritative**, and the composition `effectiveStatus = state()==6 && getProposalStatus(id)[3] ? 'action failed' : ENUM[state()]`.
4. **Encoding** — the 13-field template, the 7-field bps config, the double-layer MultiSend, `keccak256(abi.encode(data))`, `hashOperation(bytes)` as the pre-check.
5. **Salts** — the predicate, ~1/512, and the headline: *mine naively, verify with one `calculateAllAddresses(..., minExecutionDelay=0)` call, do not reimplement the vault initCodeHash.*
6. **Reading the indexer** — `Accept-Profile`, the schema↔chain table, `::text` casts, `ds_indexer_state` gating, `trust_status='sanctioned'`, untrusted columns.
7. **Glossary** — `avatar` = vault = treasury; `ds_daos.id` = DAOShip address; `launcher_contract` ≠ `deployer`; "Navigator" = plugin module.

**B2 — `scripts/gen-agent-pack.mts` + `public/agent/` (2 days).** For programmatic consumers; the MDX page stays canonical prose. Add `tsx` to devDependencies, a `tsconfig.scripts.json`, and extend vitest `include` to `{src,scripts}/**`.

Emitted files:
- `manifest.json` — `{specVersion:"0-unstable", commit, generatedAt, deploymentEpoch, files:[{path,sha256}]}`
- `addresses.json` — from `deployments.ts`, keyed by chainId, each contract carrying `address` + `codeHash`
- `abi/*.json` — 16 ABIs generated from **`daoships-contracts/artifacts/`**, not `src/config/abi/`, **normalized** to `{contractName, abi:[…]}` (today `QuaiVault.json`/`QuaiVaultProxy.json` are `{abi}` objects while the other 14 are bare arrays — an agent's `new Contract(addr, json)` breaks on exactly the vault it needs for `enableModule`)
- `bytecode/*.json` — 8 navigator blobs, each with its IPFS CIDv0 **derived from the CBOR metadata appendix** using `@ethereum-sourcify/bytecode-utils` (already a direct dependency), plus a mandatory note: *construct via `quais.ContractFactory(abi, bytecode, signer, cid)`; do not hand-assemble creation calldata — the 4-byte address-grind salt is bound to your from+nonce*
- `errors.json` — three buckets, honestly labelled: `revertSelectors` (172 distinct selectors over 240 ABI entries, shape `{selector:{name, signature, contracts:string[], meaning?}}`, with `meaningCoverage: "30/240"`), `stringReverts` (`0x08c379a0` + the four known require strings incl. `DAOShipVotes: not yet determined`), `silentFailures` (detection recipes for `actionFailed`, retention-veto, Poster truncation)
- `governance-spec.json` — the state enum, `_didProposalPass` with its snapshot source (`maxTotalSharesAtSponsor`, **shares only**), the retention veto with its *different* denominator (`maxTotalSharesAndLootAtVote`), `effectiveSponsorThreshold = min(sponsorThreshold, sharesTotalSupply)`, the `getPriorVotes(addr, now-1)` timepoint rule, the `ExpirationTooSoon` constraint, the ragequit retention cap, and the permission bitmask (ADMIN=1/MANAGER=2/GOVERNOR=4) mapped to the functions each bit gates
- `launch-spec.json` / `salt-spec.json` — field names and types generated from a named codec (see Phase C); units (`bps`/`seconds`/`wei-18`) and placeholder conventions hand-annotated in one place
- `read-api.json` — schema↔chainId table generated by parsing `schema.sql`'s `CREATE TABLE IF NOT EXISTS %I.<name>` / `REVOKE` statements; **every column untrusted by default**, explicit trusted-list; the `::text` cast recipe per numeric column; polling guidance

**Generator hard gates (build fails, not warns):**
- every address in `deployments.ts` returns non-empty `eth_getCode` on that chain's RPC **and** `keccak256(code)` matches the recorded `codeHash`
- every `rpcUrl` returns the declared `eth_chainId`
- `src/config/abi/*.json` matches `daoships-contracts/artifacts/` beyond formatting
- unmapped-selector count does not increase (ratchet)

Run this in **GitHub Actions on push to main**, commit `public/agent/` to git, and have the Vercel build only `git diff --exit-code` against a fresh run. Generation must not be a function of Vercel env vars.

**B3 — Serving and hygiene (1 day).**
- `vercel.json`: `/agent/(.*)` and `/llms.txt` must **404**, not fall through the SPA catch-all to a 200 + `index.html`. Add `Content-Type: application/json` and `Cache-Control: public, max-age=300, must-revalidate` for `/agent/*`.
- Serve under `/agent/v1/`; `/agent/*` 302s to current major.
- `daoships-www/app/llms.txt/route.ts` — spec-shaped (H1, blockquote, H2 link lists), generated from `flatDocs` the way `app/sitemap.ts:8-20` already is. `/docs/agents` is the **first** link. `app.daoships.org/public/llms.txt` is a one-line pointer to it. No `llms-full.txt`.
- `index.html:10` — the global `<link rel="canonical" href="https://app.daoships.org">` is emitted on every route, collapsing every `/dao/<addr>` URL to the homepage. Make it per-route or drop it.
- **Harden the deep-link grammar before documenting it** (`NewProposal.tsx:155-165`): validate `customTo` with `isAddress` and reject the whole prefill on failure; ignore `customValue` from the URL entirely (hardcode `'0'`, matching the builder at `customActionHref.ts:26`); **drop `customSummary`** — decode `customData` against the 16 bundled ABIs and render the decoded selector + args, showing `UNKNOWN CALLDATA — verify manually` when it cannot decode. Today an attacker-supplied URL renders arbitrary calldata under an attacker-chosen benign label.
- `SECURITY.md` in both repos: abuse-report address, and a one-page threat model naming the four adversaries (malicious DAO poisoning agents; malicious agent griefing DAOs; compromised distribution; attacker weaponizing the deep-link grammar against humans).
- `public/agent/denylist.json` honored by `Explore.tsx` — one lever against a scam-DAO burst. Half a day, and the difference between "we have a lever" and "we watch".

### Phase C — Governance correctness, in-repo (6 days)

**No npm package.** There are zero external consumers, `quais` is pinned at `1.0.0-alpha.53`, and a solo project with 7 commits does not need a publish/version/changelog obligation. Keep the anti-drift discipline — one implementation, imported by the app — and get it by hardening `src/services/utils/` and `src/types/`, not by extracting.

- **C1 (2 days) — Differential test harness for the governance predicates.** `src/types/proposal.ts` has **no test file at all**, yet it decides which bytes go on-chain and this audit found it diverging from the contract in three places. Fuzz proposal structs against a locally-deployed `DAOShip.state()`. This is the only mechanism that would have caught those divergences. Then tests for `ProposalEncoder`, `MultiSendEncoder`, `SaltMiner` (also untested today).
- **C2 (2 days) — Composed, refusing operations** in `src/services/utils/`:
  - `readProposalState(provider, dao, id)` — on-chain `state()` as the primitive. `previewProposalStatus` (renamed from `deriveProposalStatus`) is documented cache/UI-only.
  - `buildProcessTx(...)` — resolves data, computes the branch, **cross-checks against on-chain `state()` and `hashOperation()` and refuses on mismatch**, preflights the retention veto and refuses when the floor is breached ("processing now permanently defeats a passing proposal"), applies the 1.5× gas buffer.
  - `assertActionSucceeded(receipt)` — asserts **`passed === true && actionFailed === false`**, distinct errors for each. Checking `actionFailed` alone misses the retention veto, which produces a status-1 receipt, `actionFailed=false`, and a permanently-dead passing proposal.
  - `parseSubmitReceipt(receipt) → {proposalId}` and `waitForIndexed(txHash)`. Without these an agent that submits a proposal has no supported way to learn its id, and will guess with `order=proposal_id.desc&limit=1`.
  - `capabilitiesOf(provider, dao, addr)` + `requiresProposal(action, caps)` over the permission bitmask.
  - `simulateLaunch(provider, params)` — plain `eth_call` of `launchDAOShipAndVault` with the fully-encoded template. `calculateAllAddresses` verifies addresses only; it cannot catch a malformed 13-field blob, which is the single most likely launch error.
  - `deriveCyprus1Wallet(...)` / `assertUsableSigner(signer)` — throws unless `isQuaiAddress && zone === '0x00'`.
- **C3 (1 day) — Promote the inline literals.** The 13-field template moves out of `useLaunch.ts:57-89` into a named, exported, tested codec with a field descriptor that generates `launch-spec.json`. `mineSalts()` becomes a plain synchronous function (~2000 keccaks, single-digit ms in Node — **no `worker_threads`**; the Web Worker exists only to keep a browser UI responsive), with the Worker as a thin wrapper.
- **C4 (1 day) — Read-path hardening.** Bake `::text` casts and `quoteUnsafeIntegers` into the indexer services; type `ds_records.content_json`, `ds_proposals.details`, `ds_daos.name/description`, `ds_navigators.name`, and signal-poll labels as `Untrusted<string>`. `submitProposal` is `external payable` with no membership check and `proposalOffering` is commonly 0 — **anyone with gas can write arbitrary text into `ds_proposals.details`**, the first field any agent reads.

### Phase D — Read-only MCP, conditional (3 days)

Ship only if the Phase-B probe (below) shows a signal, **or** the one live DAO's operator wants it. The plausible first user is a human with Claude Code asking questions about their DAO — not an autonomous agent.

`npx @daoships/mcp`, stdio, ~8 tools. We host nothing, hold no key, and MCP's OPTIONAL authorization means no OAuth stack.

- `daoships_query({schema, table, filters, select})` — one tool, with `::text` casting, address checksumming and `Untrusted` wrapping baked in. Not 14 near-identical wrappers; every tool definition is context paid on every turn.
- `daoships_status` — indexer freshness (`is_syncing`, `requires_full_reindex` → **refuse, not warn**) merged with deployment verification.
- `build_launch`, `build_submit_proposal`, `build_process`, `build_vote`, `build_sponsor`, `daoships_simulate` — returning `{chainId, to, value, data, gasLimit, serializeWith:"quais", warnings[], deepLink}`.

**Explicit preflight refusals** (not documentation): `build_submit_proposal` computes `effectiveSponsorThreshold = min(sponsorThreshold, totalSupply)` and `getPriorVotes(self, now-1)`, then sets `value` to exactly `0n` or exactly `proposalOffering` — and enforces `expiration == 0 || expiration > now + votingPeriod + gracePeriod`. `build_sponsor` is **non-payable** (`DAOShip.sol:964`) and carries no value logic. `build_vote` accepts an array and emits `submitVotes` when length > 1, refusing while `block.timestamp <= votingStarts` (`getPriorVotes` reverts with an `Error(string)` before then). `build_proposal` auto-wraps in `executeAsGovernance` exactly where needed, refuses to wrap treasury transfers, refuses any batch containing `disableModule(daoShip)`, and reroutes `setGovernanceConfig` → `queueChange` when a sanctioned GOVERNOR TimelockNavigator is active.

**No signing.** No `DAOSHIPS_SIGNER_KEY`, no `--allow-signing`. A hot key in the same process that ingests attacker-authored `ds_proposals.details` is a prompt-injection-to-signature pipeline, and `daoships_simulate` does not close it (an `eth_call` to an attacker address simulates fine). If signing is ever wanted it is a separate `@daoships/signer` CLI that re-decodes the plan, resolves every address against `addresses.json` and `trust_status`, and requires interactive confirm or a `{to, selector}` allowlist — with `vault.enableModule` refused unconditionally.

---

## 4. The demand probe (1 day, runs before Phase B)

The draft's probe — instrument `SubscriptionNavigator.collectFee` — cannot fire. Verified: mainnet has **2 sanctioned navigators, both Onboarder/ERC20Tribute**; the only SubscriptionNavigator in existence is in the ephemeral `dev` schema. It also requires an enrolled member past grace, reverts `BurnBreachesSponsorThreshold` in small DAOs, **confiscates the member's entire share balance**, and pays in illiquid loot in a DAO the collector never audited. A null result would measure supply, not demand — and advertising it to autonomous agents builds an adversarial keeper network aimed at our own users.

**Replace with:**
1. Analytics on `daoships-www` (already SSR) segmenting `GPTBot`/`ClaudeBot`/`PerplexityBot`/`Bytespider` and chat-host referrals against the existing 30 MDX docs and `/docs/agents`. This measures whether LLMs read DAOShips at all.
2. Vercel request logs on `/agent/*`.
3. Five direct conversations with Quai-ecosystem operators: what would you delegate to an agent?
4. Instrument `LaunchWizard` step transitions (it already persists to `daoships-launch-form`, `LaunchWizard.tsx:91-99`). We have one live DAO and **zero data on why**.

**Gate:** if `/docs/agents` sees fewer than a stated threshold of LLM-crawler reads and zero inbound integrator conversations in 6 weeks, stop after Phase C. If wizard drop-off shows a specific failing step, human UX wins the next two weeks over everything here.

`collectFee` stays a documented capability with a plain warning that calling it destroys another user's shares — and the Subscription plugin UI should warn DAO operators at configuration time that it is publicly incentivized.

---

## 5. Explicit non-goals

| Not doing | Why |
|---|---|
| `@daoships/protocol` npm package | Zero external consumers, `quais` alpha, solo maintainer. Anti-drift is achieved by hardening in-repo code. Extract when a second consumer exists. |
| `llms-full.txt` | No generation story; prose restating generated facts is exactly what drifted in `FRONTEND_INTEGRATION.md` and the contracts README. One SSR `/docs/agents` page instead. |
| Hosted MCP / Vercel Functions / any server | Uptime, logging, abuse handling for something that only translates public PostgREST + public RPC. |
| Any signing, key custody, or relaying | Prompt-injection-to-signature pipeline; Quai has no AA to scope a delegated key. |
| `AgentRegistry.sol`, `daoships.dao.agents` Poster tag | 15-25 days incl. audit, to bind immutable navigators that would need redeployment; and a second, weaker, advisory authority source next to `BudgetNavigator`. |
| Phase 4 "Agent Budgets" as drafted | `src/utils/budgetProposals.ts` already exports every needed encoder and `NewProposal.tsx:427-440` already loops multi-action batches. The real gap is that `customActionHref.ts:24-33` serializes one action. **Bundling `createBudget` + `enableModule` into one proposal is a security regression** — it hides an unbounded module grant behind a bounded-sounding summary. Keep them separate; solve the inert-navigator problem by detection. Rename the surface `/dao/:daoId/budgets` "Delegated spending" — nothing distinguishes an agent EOA from a human one, so an "Agents" page fabricates a distinction the data cannot support. **~1 day if done at all, deferred behind the probe.** |
| `?spec=` launch deep link | Unauthenticated arbitrary-parameter primitive into a wizard. If ever built, it lands on a full-diff review screen with nothing auto-advanced. |
| `zod-to-json-schema` over `validation.ts` | Every meaningful constraint is inside a `.refine()`, which JSON Schema cannot express — `z.string().refine(isAddress)` emits `{"type":"string"}`. These are React-Hook-Form shapes, not transaction shapes. Hand-author a few tx-shaped schemas in `governance-spec.json` instead. |
| Recommending Realtime to agents | Supabase realtime connections are a **project-level quota shared with the human app**. Recommend polling at 30-60s with `Range` pagination; mark Realtime "human UI only". |
| Granting anon EXECUTE on `ds_get_proposal_status` | Needs a join against the DAO's periods plus the M-7 fallback; and `state()` on-chain is free and authoritative. One implementation beats three. |
| Mirroring the app's indexer query code | Zero `.range()` calls, 200-row caps, broken on-chain fallback. Publish raw PostgREST idioms. |
| Copying `VotingSidebar.tsx:108-114` quorum math | Uses `yes+no` over shares+loot; the contract uses `yesBalance` over shares-only. Only `willProposalPass` is authoritative. |
| SSR/prerendering the SPA | Hosting-model change. `daoships-www` is already SSR and is the right agent surface. |
| WebMCP, A2A, x402, ERC-8004, ERC-7715/7710, agents.json, ai-plugin.json | Non-goals by their own specs, wrong layer, wrong chain, or dead. Documented as constraints in `/docs/agents`, not built. |

---

## 6. Audit response

### CRITICAL

| # | Finding | Disposition |
|---|---|---|
| C1 | `addresses.json` keyed by 9 and 15000 is not generatable — no per-chain map exists (raised by 4 of 6 auditors) | **FIXED, and the premise was softer than stated.** The map did not exist as an artifact, but all 18 addresses were recoverable: mainnet from `daoships-contracts` (6 in `deployment-addresses.json`, 2 more in the timestamped file's `references` block), Orchard from `contracts.ts` defaults, and both vault singletons from `factory.implementation()`. §1.5 now records all nine pairs, `eth_getCode`-verified. Day 1 commits them; the generator transcribes. |
| C2 | Hardcoded defaults are dead on mainnet — `isQuaiAddress()` cannot detect it | **PARTLY WITHDRAWN.** The auditor tested `contracts.ts` defaults against chain 9 and found zero bytecode — correct, but the conclusion "stale" was wrong. All nine are **live on Orchard**, and bytecode lengths match mainnet pairwise across every row: this is a complete, current *testnet* set. The real defect is narrower and still real: no per-chain map, and "cyprus1" names chain 9 in one repo and 15000 in another. Mitigation unchanged — per-chain `eth_getCode` + `codeHash` gate, which catches genuine staleness *and* cross-network mixups. |
| C3 | Generator cannot import `contracts.ts` (`import.meta.env` undefined, `@/` alias, `tsx` absent) | **FIXED.** Plain-data `deployments.ts` with zero imports; `tsx` + `tsconfig.scripts.json` added; vitest `include` extended. |
| C4 | `https://rpc.quai.network` 404s; shard path mandatory; `.env` testnet URL dead | **FIXED + verified this session** (`/cyprus1` → `0x9`). Correct URLs in `deployments.ts`, gated by a live `eth_chainId` check. Claim A's CORS justification is **withdrawn** — the public RPC sends `access-control-allow-origin: *`. |
| C5 | Quai txs are protobuf; viem/ethers cannot broadcast | **DOWNGRADED to a library note.** True, but not a blocker under the stated premise: quais signs protobuf natively (verified — 111-byte payload, round-trips, correct `from`). One sentence in `/docs/agents`: "use quais, not viem/ethers." The `serializeWith:"quais"` field stays in Phase D builders. |
| C6 | Random keys are ~0.2% Cyprus-1-valid; `Wallet.createRandom()` doesn't exist | **LARGELY WITHDRAWN.** The statistic is real only for `new Wallet(randomBytes(32))`. `QuaiHDWallet.createRandom()` + `getNextAddress(0, Zone.Cyprus1)` works first try — verified. Reduced from a "Before you start" section to one line. `deriveCyprus1Wallet` in C2 is **cut**; `assertUsableSigner` is kept as cheap insurance. |
| C7 | `quai_*` rejects non-EIP-55 addresses; indexer returns lowercase | **CONFIRMED but narrowed, and I reproduced it twice.** `quais.Contract` and `AbiCoder` *do* normalize lowercase; **raw `provider.getCode/call/getBalance` do not** and the node returns `address has invalid checksum`. So the hazard is specifically `indexer row → raw provider method`. Documented as that exact rule in `read-api.json` + `/docs/agents`, with `quais.getAddress()` as the fix. |
| C8 | Deep-link grammar is unauthenticated arbitrary calldata with an attacker-chosen label | **FIXED in Phase B3** *before* documenting: validate `customTo`, ignore URL `customValue`, drop `customSummary`, decode-and-render calldata. |
| C9 | Bundled `createBudget` + `enableModule` hides an unbounded module grant | **FIXED.** Bundling removed; Phase 4 cut to detection + a renamed budgets page, deferred behind the probe. |
| C10 | `collectFee` probe cannot fire and weaponizes agents against users | **FIXED.** Replaced with crawler analytics + operator conversations + wizard instrumentation. `collectFee` demoted to a documented capability with a plain warning. |
| C11 | Agent pack built in the JS-only SPA while the wrong 6-field doc sits on the crawlable SSR site | **FIXED, and narrowed.** The 6-vs-7 `governanceConfig` defect is **re-confirmed against the contract** (`DAOShip.sol:605` decodes 7; `page.mdx:26-34` encodes 6) and is fatal — `abi.decode` reverts at init. But the same finding's second claim, that the doc's MULTISEND matches nothing, is **withdrawn**: `page.mdx:51` is `0x003f62e6…`, the live mainnet MultiSendCallOnly, explicitly commented `(mainnet)`. The auditor compared it against the Orchard set. Day 1 changes one field and leaves the address alone. |
| C12 | `deriveProposalStatus` never returns Defeated; ignores on-chain `state()` | **FIXED.** Phase A adds the branch; Phase C2 makes `state()` the primitive and renames the local function `previewProposalStatus`. |
| C13 | `src/config/abi/DAOShip.json` is stale — missing `InsufficientProcessGas` | **FIXED.** Phase A syncs; Phase B generates ABIs from `artifacts/` with a CI equality gate. |
| C14 | `assertActionSucceeded` checks the wrong flag — retention veto yields `passed=false, actionFailed=false` | **FIXED.** Asserts both; `buildProcessTx` preflights retention and **refuses**. |
| C15 | Generation is a function of Vercel env, `manifest.commit` would lie, no CI exists | **FIXED.** GitHub Actions generates and commits; Vercel only `git diff --exit-code`. CI stand-up is an explicit Phase A line item. |

### HIGH

| # | Finding | Disposition |
|---|---|---|
| H1 | SPA catch-all returns 200 + HTML for missing `/agent/*` | **FIXED** (Phase B3 explicit 404 route + JSON headers). |
| H2 | Bundled addresses in an npm package guarantee split-brain on redeploy | **FIXED by removal** — no package. `deploymentEpoch` + `codeHash` in `addresses.json`; redeploy runbook in `SECURITY.md`. |
| H3 | `read-api.json` has no generatable source | **FIXED.** Parsed from `schema.sql`'s `CREATE TABLE`/`REVOKE` statements; every column untrusted by default. |
| H4 | No versioned URL namespace / deprecation policy | **FIXED.** `/agent/v1/`; `manifest.specVersion:"0-unstable"`; compatibility policy in `/docs/agents`. |
| H5 | Untrusted surface understated — `ds_proposals.details` is permissionlessly attacker-authored | **FIXED** (Phase C4; `Untrusted<string>` on all six named surfaces). |
| H6 | MCP signing mode is a prompt-injection-to-signature pipeline | **FIXED.** Signing removed from the MCP package entirely. |
| H7 | `verifyContractDeployments` is presence-only, passes on the wrong network | **FIXED.** `codeHash` comparison in the generator gate and in `assertUsableSigner`'s sibling deployment check. |
| H8 | Schema↔chainId is not a bijection; `mainnet.ds_indexer_state.chain_id` says 15000 | **FIXED.** Phase A fixes the column; binding is schema-primary in `read-api.json`; `dev` marked ephemeral. |
| H9 | No post-submission correlation — agent can't learn its proposal id | **FIXED.** `parseSubmitReceipt` + `waitForIndexed` in Phase C2. |
| H10 | bigint fix is JS-only | **FIXED.** `::text` casts are the canonical published recipe; client coercion is fallback. |
| H11 | Phase 0 scoped as four defects; 50 tsc errors live and `tsc` is a no-op | **FIXED.** `tsc -b` + zero-errors is a Phase A line item with its own days. |
| H12 | 16 ABIs ship in two incompatible JSON shapes | **FIXED.** Generator normalizes to `{contractName, abi}`. |
| H13 | `build_navigator_deploy` returning unsigned calldata is impossible (quais' from+nonce-bound grind salt) | **FIXED.** Tool dropped from the Phase D surface; `bytecode/*.json` carries the mandatory ContractFactory note. |
| H14 | `build_sponsor` msg.value logic is on the wrong function; no `build_submit` | **FIXED.** `build_submit_proposal` added with the `min()` threshold and exact-offering rule; `build_sponsor` is non-payable. |
| H15 | No `Error(string)` handling — `DAOShipVotes: not yet determined` breaks same-second sponsor→vote | **FIXED.** `stringReverts` bucket in `errors.json`; `build_vote` refuses at `timestamp <= votingStarts`. |
| H16 | `DaoService.ts:1084` collapses quorum to 0 during indexer outages | **FIXED** in Phase A, plus `willProposalPass` now throws rather than defaulting. |
| H17 | `buildProcessTx` / `ProposalDetail.tsx:181` fall through to `'0x'` on the Ready branch | **FIXED** in Phase A and C2 (throw `ProposalDataUnavailable`). |
| H18 | Realtime guidance inverts the risk (project-level shared quota) | **FIXED.** Guidance reversed. |
| H19 | No integrity story for the agent pack | **PARTIAL.** `manifest.json` carries per-file sha256 and the pack is committed to git and reviewable in PRs. **Offline signing key deferred** — with no npm package and no key custody, the residual blast radius is "agent reads a wrong address", which the `codeHash` gate and on-chain `calculateAllAddresses` verification both catch. Revisit if a package ships. |
| H20 | Documenting the launch path lowers the bar for scam-DAO factories | **PARTIAL.** `public/agent/denylist.json` + `SECURITY.md` + Explore ranking by age/members/treasury ship in Phase B3. Accepted residual: the chain cannot be censored. |
| H21 | Phase 2 npm package (8-12d) is justified by anti-drift, not demand | **FIXED by cutting it.** Phase C keeps the discipline in-repo at 6 days. |
| H22 | MCP is mis-sequenced last; the plausible first user is a human with Claude Code | **PARTIALLY FIXED.** Phase D is 3 days, read-first, ~8 tools — but still gated behind the probe, because it is 3 days spent for a user we can identify by name and simply ask. |
| H23 | Phase 0 bug fixes framed as agent prerequisites | **FIXED.** Phase A is explicitly unconditional. |
| H24 | Salt front-running is a denial-of-launch enabled by publishing the recipe | **FIXED.** Derive salts from a caller secret so re-mining is instant; `launchDao` catches the mismatch revert and re-mines; hazard documented. |
| H25 | Navigator IPFS CIDs are hand-copied with no verification | **FIXED.** Derived from CBOR metadata via `@ethereum-sourcify/bytecode-utils`; the 8 literals in `NavigatorDeployService.ts:28-45` are deleted and a test asserts derived == shipped. |
| H26 | "Agents" page premise has no underlying data | **FIXED.** Renamed `/dao/:daoId/budgets`, classification dropped. |
| H27 | `collectFee` quickstart unexecutable (zero mainnet instances) | **FIXED** — see C10. |
| H28 | The MDX docs already drift and would remain unguarded | **PARTIAL.** Day 1 fixes the two known errors; `/docs/agents` is generated-adjacent. **A CI check that MDX code fences match generated specs is NOT built** — the fences are prose examples, not extractable. Accepted; mitigated by keeping the authored surface to one page. |

---

## 7. Sequencing

```
Day 1        : Fix www MDX + per-chain deployment-addresses.json      [1d]
Probe        : crawler analytics + wizard instrumentation + 5 calls   [1d]  (runs in parallel)
Phase A      : bug fixes + tsc -b + CI                                [4d]  (no deps)
  precond    : src/config/deployments.ts                              [0.5d] (needs Day 1)
Phase B1     : /docs/agents SSR page                                  [2d]  (needs Day 1)
Phase B2     : gen-agent-pack + public/agent/v1                       [2d]  (needs precond, Phase A CI)
Phase B3     : serving, deep-link hardening, SECURITY.md, denylist    [1d]
Phase C1     : differential harness + encoder tests                   [2d]  (needs Phase A)
Phase C2     : composed refusing ops                                  [2d]  (needs C1)
Phase C3     : promote inline literals, sync mineSalts                [1d]  (feeds B2's launch-spec)
Phase C4     : Untrusted typing + ::text read path                    [1d]
─────────────────────────────────────────────────────────────────────
                                                          Total ~16.5d
Phase D      : read-only MCP, ~8 tools, no signing        [3d]  CONDITIONAL on probe
Budgets page : /dao/:daoId/budgets                        [1d]  CONDITIONAL on probe
```

**Sequencing note:** C3 emits the field descriptors B2 consumes, so if C3 slips, `launch-spec.json` ships hand-authored with a TODO rather than blocking B2. That is the one accepted drift seam.

---

## 8. Open questions needing your decision

1. ~~**Are the chain-9 addresses recoverable?**~~ **RESOLVED.** All nine mainnet addresses are verified and recorded in §1.5; Day 1 is unblocked. One residual ask: **confirm the `daoships-app-mainnet` Vercel env matches the §1.5 mainnet column.** I can read the repos and the chain but not your Vercel project. If they disagree, production is running something other than what the contracts repo says was deployed — treat that as an incident ahead of everything else in this plan.
2. **Is the probe gate real?** If the answer to "fewer than N crawler reads in 6 weeks" is "ship Phase D anyway," say so now and I'll sequence it into week 2 instead of writing an analytics gate nobody will honor.
3. **Should `deriveProposalStatus`'s Defeated fix ship as a UI change too?** It will start showing "Defeated" on proposals the UI currently labels "Ready" — correct, but visible and possibly alarming to the one live DAO's members. Ship silently or with a changelog note?
4. **Freeze window for the contracts?** Publishing `specVersion` over a surface that changed twice in 7 commits creates an implicit compatibility promise. I've labelled it `"0-unstable"`. If a redeploy is planned in the next month, B2 should wait for it.
5. **`quorumPercent` warning threshold.** I want `percentToBps` to warn when `quorumPercent < 100` (i.e. under 1%), since natural-language intent → bps is the highest-consequence conversion in the system. Is 100 the right floor, or do you have DAOs legitimately below it?
6. **Does the `dev` Supabase schema stay?** It is a month stale, holds the only SubscriptionNavigator, and the checked-in `dist/` was built against it. Document it as ephemeral, or delete it so agents cannot accidentally target it?
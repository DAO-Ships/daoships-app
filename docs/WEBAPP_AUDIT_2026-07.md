# DAOShips Web App — Security & Code Audit

**Commit:** `394c22e` (main, clean tree) · **Scope:** 275 source files / 44,711 LOC · **Method:** static analysis only, no live infrastructure touched

---

## Executive summary

This is a competent, security-conscious codebase with a serious hole in its verification pipeline and a consistent pattern of validating on one path but not the parallel one. The app treats attacker-authored on-chain data as untrusted in most places — `CustomActionDetail` refuses to trust a selector-only decode without a navigator-type check, `NavigatorCard` labels deployer-supplied metadata as untrusted, `SafeMarkdown` escapes everything — and then omits exactly those controls in the one screen where a voter decides to hand a contract mint authority. The build's `tsc` is a no-op (`tsconfig.json` is `{"files": [], "references": []}` and the script uses bare `tsc`, not `tsc -b`), which is why 51 type errors ship, one of them a live `ReferenceError` in a user-facing recovery flow. Test coverage is 5.4% of LOC and is structurally misallocated: all 55 hooks, all 12 indexer read services, all 12 pages, and the 1,139-line `DaoService` have zero tests, while pure utils are well covered. Nothing here is an unauthenticated fund-drain — every exploit path routes through a proposal that must be sponsored and win a vote — but several defects meaningfully degrade a voter's ability to see what they are approving. Scalability is uniformly deferred: every indexer list query is capped at a hardcoded 200 (or unbounded), with all pagination, filtering and sorting done client-side over the truncated window.

**The three things that matter most:**

1. **`ProposalDecoder` discards the fields that determine what a transaction actually does** — `executeAsGovernance`'s target and value, every branch's `tx.value`, the MultiSend operation byte, and the timelock target — while rendering reassuring, authoritative-looking labels. This is the single highest-leverage security fix in the codebase and it is small.
2. **`tsc` does not run.** One line (`tsc -b && vite build`) turns 51 latent errors into a gate. It must land together with the fixes, or deploys break.
3. **Token decimals are hardcoded to 18 on every write path** (budget create/disburse, ERC-20 tribute deploy, transaction builder) while every read path resolves them correctly. Same bug, five files, one root cause.

---

## 1. Security

### S1 — `executeAsGovernance` target and value discarded; arbitrary value-bearing calls render as benign governance actions
**Severity: High** · `src/services/utils/ProposalDecoder.ts:202-208` · **Effort: S**

```ts
const govCall = tryDecodeFunctionData(DAOSHIP_INTERFACE, tx.data)
if (govCall?.name === 'executeAsGovernance') {
  const innerData = govCall.args[2] as string
  const inner = decodeGovernanceInner(innerData)
  if (inner) return inner
}
```

`executeAsGovernance(address _to, uint256 _value, bytes _data)` is decoded using only `args[2]`. `args[0]` (target) and `args[1]` (value) are never read, never validated against the DAO address, and never displayed. `decodeProposalActions()` takes no DAO address parameter at all, even though `daoId` is in scope at the call site (`ProposalActionSummary.tsx:371-372`).

**Failure:** Attacker submits (permissionless — `submitProposal` is external payable with no membership check) a MultiSend entry: `to=DAO, value=0, data=executeAsGovernance(0xATTACKER, 500e18, mintShares([0xATTACKER],[1000e18]))`. Verified against the real decoder: output is exactly `[{type:'mintShares', label:'Mint shares to 1 address', details:{recipients:[{address:'0x0022…', amount:'1000.0'}]}}]`. Voters approve a routine share grant; execution mints nothing and sends 500 QUAI to the attacker. `proposalTypes.ts:59-62` propagates the spoof to the list-view badge, so the DAO's proposal list lies too.

**Fix:** Thread the DAO address into `decodeProposalActions`/`decodeSingleTx`. Take the governance branch only when `addressesEqual(tx.to, daoId) && addressesEqual(govCall.args[0], daoId) && govCall.args[1] === 0n` — i.e. exactly the shape `ProposalEncoder.wrapGovernance()` (`ProposalEncoder.ts:92-98`) can produce. Anything else falls through to `custom`, which already surfaces target/value/calldata.

---

### S2 — Decoder drops every field a voter needs to evaluate a transaction (value, operation byte, timelock target)
**Severity: Medium** · `src/services/utils/ProposalDecoder.ts:74, 199, 229, 252` · **Effort: S**

Three distinct omissions, one root cause: `decodeSingleTx(tx: { to, value, data })` throws away everything the parser already extracted.

- **Native value hidden on non-empty-calldata actions** (`:229-239`). `tx.value` is surfaced only in the native-transfer branch (which requires empty calldata) and the `custom` fallback. An ERC-20 `transfer(attacker, 1)` with `value: 999e18` renders as a 1-wei dust transfer; the 999 QUAI is invisible. Same hiding place on Poster, governance and timelock branches.
- **MultiSend operation byte parsed then discarded** (`:74` reads it, `:95` carries it, `:199` drops it). A `delegatecall` entry renders byte-identically to a `call`. Mitigated today because the app always wires `MULTISEND_CALL_ONLY` (`useLaunch.ts:78`), which reverts on `operation != 0` — so the current impact is a passed proposal that burns the processor's gas on a revert, not a takeover. Still a completeness gap voters cannot see through.
- **Timelock `queueChange` matched by selector alone** (`:252-263`). `tx.to` is never checked against the DAO's registered `TimelockNavigator`s, and the branch never even renders `d.timelock`. `ProposalActionSummary.tsx:295-306` then prints explicitly calming copy: *"Queued through the timelock — it does not apply when the proposal passes. After a delay (a second ragequit window)…"* An attacker contract exposing `queueChange(bytes)` gets that narrative applied to an arbitrary call. The codebase already recognises this exact hazard — `CustomActionDetail.tsx:60-65` refuses a selector-only vesting decode unless `targetNav?.navigator_type === 'VestingNavigator'`.

**Fix:** Add `value` and `operation` to `DecodedAction.details` for every branch; render a red *"+ N QUAI native value"* row and an unmissable *"DELEGATECALL — executes in the DAO's own context"* banner (`CustomActionDetail.tsx:87-95` already does the value block correctly — reuse it). Thread the navigator map (already fetched in `ProposalActionSummary`) into the timelock decode and require `navigator_type === 'TimelockNavigator'`.

---

### S3 — Ungranted permissioned navigators are presented as DAO-endorsed
**Severity: Medium** · `src/pages/dao/NavigatorDetail.tsx:118, 143` · `src/components/navigator/NavigatorCard.tsx:90` · `src/components/proposal/ProposalActionSummary.tsx:331` · **Effort: S**

Every navigator constructor takes `daoShipAddress` plus deployer-chosen `name`/`description` as plain params, so anyone can deploy a navigator bound to any DAO. The indexer assigns the whole permissioned class `trust_status = 'sanctioned'` **at deploy time**, before any `NavigatorSet` fires. Three consumers read that born-state as an endorsement:

- `NavigatorDetail.tsx:118` — `const isTrusted = isNavigatorVisible(navigator, false)` is true for a never-voted-on navigator, so the attacker's chosen `name` renders as the page `<h1>`. Line 143 (`showTrustWarning = isReadOnly && trust_status !== 'sanctioned'`) suppresses the *"Anyone can deploy a contract claiming to belong to this DAO"* banner for exactly these navigators. The file's own comment states the opposite intent.
- `NavigatorCard.tsx:90` — `isReadOnly` classifies by runtime permission bits, but an ungranted permissioned navigator also reads permission 0, so it takes the read-only path and gets a green **"Sanctioned — Endorsed by the DAO via a governance-voted vault post"** pill next to a contradictory "Needs activation" badge.
- `ProposalActionSummary.tsx:331` — the `setNavigators` branch replaces the address with `meta.name` plus a type chip and description, with no trust marker. `NavigatorCard` renders the same fields behind an explicit "Deployer / not governance-approved" chip; the one screen where a member decides to grant Admin+Manager+Governor drops it.

`src/utils/navigatorSanction.ts:36-43` documents the correct rule — *"the class is derived from the catalog (intended role), NOT runtime permission bits"* — and is ignored by all three.

**Fix:** Use `classify()`/`navigatorNeedsSanction()` from `navigatorSanction.ts` in `isNavigatorVisible`, `isTrusted`, `showTrustWarning` and the badge. Render `AddressDisplay` as primary identity in the proposal summary with `meta.name` behind the "Deployer" chip.

---

### S4 — Navigator-sanction proposal wipes the DAO's entire endorsement set when the navigator list fails to load
**Severity: Medium** · `src/pages/dao/NewProposal.tsx:747` · **Effort: S**

```ts
readOnlyNavigators={(navigators || []).filter(
  (n) => n.permission === NavigatorPermission.None && !n.permission_ever_granted,
)}
```

`useNavigators(daoId)` is destructured without `isLoading`/`isError` (line 172). `NavigatorSanctionForm` posts the DAO's **complete** sanctioned set with last-write-wins semantics and seeds `sanctioned` from `readOnlyNavigators` in a `useState` initialiser that never resyncs. With an empty list plus a deep-link prefill, `sanctioned = {prefill}`, `currentlySanctioned = {}`, `isChanged` is true, Submit is enabled — while the banner at `NavigatorSanctionForm.tsx:145` assures *"Your DAO's other endorsements are preserved."*

The realistic trigger is not a render race but `DaoService.getNavigators`'s silent `[]` return under an `isIndexerAvailable()` blip (see **ST3**), which produces a stable empty list while `dao` and `member` still resolve via their own fallbacks.

**Fix:** Gate the form on `isLoading`/`isError`; require a non-empty `readOnlyNavigators` (or an explicit `listComplete` prop) before enabling submit.

---

### S5 — CSP blocks the WalletConnect relay and two live fetch paths
**Severity: Medium** · `vercel.json:13-14` · **Effort: Trivial**

`connect-src` allows only `*.walletconnect.com`. The installed core defaults to `wss://relay.walletconnect.org` (115 occurrences in `node_modules/@walletconnect`, and `fu="wss://relay.walletconnect.org"` is in the committed `dist/assets/core-*.js`), and the bundled AppKit fetches `api.web3modal.org`. `src/config/wagmi.ts:56-68` passes no `relayUrl` override, so the `.org` default ships. `VITE_WC_PROJECT_ID` is set, so `ConnectModal` renders the button — the only non-injected wallet path is dead in production, surfacing as a generic error via `useWallet.ts:114-121`.

Two more hosts are missing: `fetchAbiFromExplorer` targets `quaiscan.io` (`ContractMetadataService.ts:163-167`, default `contracts.ts:42`) and `useNftTokenImage` targets `ipfs.io` (`url.ts:78`). Both fail closed with `catch { return null }`, so the ABI decode silently degrades to `Selector: 0x…` and NFT gallery images never render, with no signal that resolution was *blocked* rather than *unavailable*.

**Fix:** Add `https://*.walletconnect.org wss://*.walletconnect.org https://api.web3modal.org`, the configured explorer origin, and `https://ipfs.io` to `connect-src`. Or drop the WalletConnect connector entirely and reclaim ~1 MB (see **E1**). Surface a distinguishable "ABI resolution blocked" state.

---

### S6 — Every contract address silently falls back to a stale testnet literal; the production validation throw is dead code for a missing var
**Severity: Medium** · `src/config/contracts.ts:88-112, 120-144` · **Effort: S**

All nine entries use `||` with a non-empty, checksum-valid Orchard-testnet literal. `validateContractConfig()` only rejects an address that is falsy (`:125`) or fails `isAddress` (`:128`) — neither is reachable when the var is unset, because the fallback already substituted a valid address. The `throw new Error('[contracts] Invalid contract configuration in production build')` at `:139-141` fires only for a var set to *garbage*, never one that is *missing*. `.env.example` ships all nine blank. Commit `49001d1` ("Deploying to mainnet") updated `NETWORK_CONFIG`/`IS_MAINNET` but left the literals on testnet.

The same fail-open shape covers `quaiVaultUrl`/`blockExplorerUrl` (`:41-43`, never validated, never cross-checked against `CHAIN_ID`) and `VITE_NETWORK_SCHEMA` (`supabase.ts:17`, defaults to `'dev'`, never compared to `CHAIN_ID`).

**Mitigating:** `verifyContractDeployments()` (`:161-202`) runs `quai_getCode` on wallet connect and every chain change, raising a sticky (duration 0) notification — so a missing var is loud, not silent. But it is presence-only (`code !== '0x'`), so a stale address that still has *some* code passes clean, and it misattributes a total RPC failure as "your wallet is on the wrong network" (`useWallet.ts:84-88`) because the catch at `contracts.ts:187-190` buckets transport errors as "missing".

**Fix:** Gate the `||` defaults on `import.meta.env.DEV` so `validateContractConfig`'s PROD throw does its stated job. Add `quaiVaultUrl`/`blockExplorerUrl`/`NETWORK_SCHEMA` to the validator and derive all three from a `CHAIN_ID`-keyed table. Return a third `errored` bucket from `verifyContractDeployments` and branch the toast on `wagmiChainId !== NETWORK_CONFIG.chainId`.

---

### S7 — Deep-link prefills bypass validation the manual path enforces
**Severity: Low** · `src/pages/dao/NewProposal.tsx:143-146, 155-165` · **Effort: S**

`addAddress` is taken raw with no `isAddress()` check; `addPermission` is a bare `Number()` (accepts NaN, negative, out-of-enum). `NavigatorForm.tsx:81-87` seeds it directly into `changes`, while the manual path validates (`:108-112`) and the sibling `NavigatorSanctionForm.tsx:55` validates its own deep link. Separately, `buildCustomActionHref` hardcodes `customValue: '0'` with the comment *"governance calls never send native value"*, but the consumer accepts any value plus an attacker-authored `customSummary` that becomes the row label.

This is phishing/UX asymmetry, not an authorization bypass — the same values are typeable manually, the address and permission label are rendered, and the proposal still needs sponsorship and a vote. But the producer's own contract should be honoured.

**Fix:** Require `isAddress(addAddress)` and a permission in the `PERMISSION_OPTIONS` value set; force `customValue: '0'` (or require explicit in-form confirmation); validate `customData` against `/^0x([0-9a-fA-F]{2})*$/`.

---

### S8 — Allowlist entries skip Cyprus-1 shard validation, and invalid lines are silently dropped before an immutable root is committed
**Severity: Low** · `src/utils/allowlist.ts:42-53` · `src/components/navigator/NavigatorCatalog.tsx:466, 517, 594` · **Effort: Trivial**

`parseAllowlistInput` is the only address entry point in the app using bare `quais.getAddress` instead of `isValidCyprus1Address` — every neighbouring field (tribute token `:510`, gate token `:564`, treasury token `:702`, initial member `:727`, `MembersStep.tsx:52`, `VaultStep.tsx:69`) enforces the shard prefix. Separately, all three catalog deploy branches check only `addresses.length` against the cap and never `invalid.length`, while `LaunchWizard.tsx:265, 277` *does* gate on it — the two deploy paths have drifted. `allowlistRoot` is a constructor arg with no setter in any navigator ABI, so both mistakes are permanent until redeploy + re-sanction.

**Fix:** Use `isValidCyprus1Address` in `parseAllowlistInput`, pushing failures into the existing `invalid` array. Mirror `LaunchWizard`'s `invalid.length > 0` guard in all three catalog branches — better, disable the Deploy button while any invalid entry is present.

---

### S9 — Lower-severity security items (batch)
**Severity: Low** · **Effort: Trivial–S each**

| Item | Location | Issue |
|---|---|---|
| Untrusted images lack referrer/credential hardening | `ClaimedTokensGallery.tsx:121-128, 139-144` | Missing `referrerPolicy="no-referrer"`/`crossOrigin` that `DaoAvatar.tsx:36`, `DaoBanner.tsx:33`, `MemberAvatar.tsx:44` all set. Conversely, `crossOrigin="anonymous"` on those three *breaks* legitimate images from non-CORS hosts — no canvas read exists anywhere (`grep toDataURL\|getContext` → 0 hits), so it buys nothing. Pick one policy. |
| `img-src 'self' data: https:` permits any host | `vercel.json:13` | Attacker-authored avatar/banner URLs become per-visitor IP/UA beacons. Narrow to `'self' data:` + the IPFS gateways. |
| Bidi/homograph in auto-linked URLs | `SafeMarkdown.tsx:25-55` | Raw matched substring is both `href` and visible label; U+202E and Cyrillic homographs pass through unmodified. Strip U+200B–U+200F / U+202A–U+202E / U+2066–U+2069 and render the parsed host. |
| `proposal_data` never checked against `proposal_data_hash` | `ProposalDetail.tsx:181, 323` | The field exists on the row and in the ABI; `keccak256` is never computed over it. Cheap defense-in-depth: refuse to render/submit on mismatch. |
| Allowlist lookup starvable | `RecordIndexerService.ts:206-220` | `.limit(20)` server-side, navigator filter applied client-side after. 20+ allowlist posts for a target DAO evict the real record; `staleTime: Infinity` makes it stick. Filter server-side on `content_json->>navigatorAddress`. |
| `approve()` broadcast before `onboard` is simulated | `NavigatorService.ts:501` | Any onboard revert leaves a standing allowance with no revoke path. Add a `staticCall` dry-run before approving. |
| IPFS allowlist body unbounded | `useNavigatorAllowlist.ts:36-40` | `content-length &&` guard skipped when absent; the fallback check runs *after* `response.text()` buffers everything. Stream with a reader and abort at the cap. |
| Lazy-loaded pipeline state unvalidated | `ReviewStep.tsx:95-103` | Bare `JSON.parse(raw) as PipelineState` from a global localStorage key with no account/chain binding, feeding `MANAGER_PERMISSION` navigator addresses. `LaunchWizard.tsx:106-165` zod-validates its own blob; this one does not. |
| `sanitize.ts`/DOMPurify has zero production wiring | `src/utils/sanitize.ts` | No importer outside its own test. Harmless today (`dangerouslySetInnerHTML` has 0 hits), but `FRONTEND_GUIDE.md:801` and two audit docs assert it as an active control. Delete it or wire it. |

---

## 2. Stability

### ST1 — Token decimals hardcoded to 18 on every write path while read paths resolve them correctly
**Severity: High** · `ReviewStep.tsx:275-276` · `BudgetPlugin.tsx:398-399, 636, 652` · `TransactionBuilder.tsx:345` · **Effort: M**

`parseTokenAmount`/`formatTokenAmount` default to `DEFAULT_DECIMALS = 18` (`format.ts:9, 21, 61`). Four write sites call them with no decimals argument for arbitrary ERC-20s:

- **ERC-20 tribute deploy** (`ReviewStep.tsx:275`): `pricePerShare`/`pricePerLoot` are denominated in the user-supplied `tributeToken`. The UI hint promises token decimals (`NavigatorsStep.tsx:423`) and the placeholder is literally `e.g. Pay USDT for shares` — USDT is 6 decimals. These are **constructor arguments** (`NavigatorDeployService.ts:266-267`), immutable once deployed. `1` becomes 10¹² USDC per share; nobody can ever onboard, and fixing it requires a governance redeploy.
- **Budget create + disburse** (`BudgetPlugin.tsx:398, 636`): the form accepts any ERC-20 (`:375`) yet parses at 18. A 10,000 USDC/month budget encodes an allowance of 10¹⁶ USDC — the cap stops constraining anything — and the disburse box scales by the same wrong factor, so transfers revert while "Remaining this period" reads 10¹² times too small. `useTokenMetadata(budget.token)` is already called at `:487` and only `.symbol` is read.
- **Transaction builder** (`TransactionBuilder.tsx:345`): `tokenMeta?.decimals ?? 18` with the emit effect gated only on `isValidToken && encodedData` — never on `tokenMeta` being loaded. The `KnownToken` interface (`:25-29`) drops `decimals` even though `NewProposal.tsx:811` passes it and the sibling `CustomActionForm.tsx:27-32` declares it.

The codebase demonstrably does not assume 18 elsewhere: `NavigatorService.ts:404-412`, `ERC20TributePlugin.tsx:257/376`, `FundingForm.tsx:184`, `CustomActionForm.tsx:353`, `useTreasuryBalances.ts:81` all thread real per-token decimals. The write paths are the outliers.

**Related, display-only:** `ProposalDecoder.ts:237` formats decoded ERC-20 transfers with `quais.formatQuai` (fixed 1e18), and `NewProposal.tsx:350` encodes funding with `quais.parseQuai` — the two errors cancel in the review screen, making the wrong amount undetectable by inspection.

**Fix:** Thread real decimals everywhere (`fetchTokenMetadata` already exists, `NavigatorService.ts:406-412` shows the pattern). Add `decimals: number` to `TransactionBuilder`'s `KnownToken` and seed from the selected token. **Block the emit/deploy/disburse button until decimals resolve for a non-native token — never guess 18.** Return the raw bigint + token address from the decoder and format at the render site.

---

### ST2 — Indexer outage makes ragequit burn shares for zero payout
**Severity: High** · `src/services/DaoService.ts:219-229` · `src/components/member/RagequitModal.tsx:206, 450` · **Effort: S**

```ts
async getGuildTokens(daoId: string): Promise<GuildToken[]> {
  if (await isIndexerAvailable()) {
    try { return await daoIndexerService.getGuildTokens(daoId) }
    catch { /* Fall through to empty */ }
  }
  // No on-chain list enumeration available
  return []
}
```

The comment is **false**: `getOnChainGuildTokens` exists at `:235-239`, `getGuildTokens` is in `DAOShip.json:1135`, and the method has zero call sites. The empty list flows through `useTreasury` → `Members.tsx:643` → `RagequitModal`, which renders it as a positive assertion: *"This DAO has no guild tokens configured. Ragequitting will burn your shares/loot but you will not receive any tokens."* `canReview = totalBurn > 0n && !sharesOverflow && !lootOverflow` (`:206`) requires no token, so the flow proceeds and submits `tokens: []` — a valid ragequit that burns without transferring.

The failure is asymmetric, which is what makes it reachable: `getMember` and `getDao` *do* fall back on-chain, so during an outage the member's balances render fine while the treasury reads empty.

**Compounding:** `useTreasuryBalances.ts:84-87` converts a single failed `balanceOf` into `balance: 0n, symbol: '???'` rather than an error, so the query never enters `isError` and a funded token shows as "(empty)" with a 0 payout preview.

**Fix:** Fall back to `getOnChainGuildTokens` instead of `return []`, and let the error propagate when neither source works. In `RagequitModal`, distinguish "loaded, empty" from "failed to load" and hard-block confirm on a load error. In `useTreasuryBalances`, return `balance: null / error: true` per token and disable selection while any balance is unresolved.

---

### ST3 — Indexer failures are swallowed into legitimate-looking empty state; reads are gated on a separate health endpoint that defaults to empty in production
**Severity: Medium** · `src/services/DaoService.ts:188, 205, 219, 306, 341, 378, 414, 430` · `src/config/supabase.ts:95` · `IndexerHealthService.ts:43, 71` · **Effort: M**

Two coupled defects:

**(a) 14 catch-and-return-`[]` sites nullify the `indexerError` design.** `src/services/indexer/indexerError.ts:13` exists specifically so failures throw and `isError` fires — its header says views *"showed an EMPTY state when the indexer was actually down."* `DaoService` re-swallows every throw. The consumer error branches are unreachable dead code: `Explore.tsx:119 ) : error ? (` can never render, and `Home.tsx:136` shows *"Calm waters ahead — No DAOs have launched yet."* during an outage.

**(b) All reads gate on `isIndexerAvailable()`, which depends on a separate HTTP endpoint.** `HEALTH_URL` defaults to `''` in PROD; `getStatus()` then caches `healthy: false` permanently, so 13 read sites skip Supabase entirely even though PostgREST is fine. `isHealthy()` also requires strict `data.status === 'healthy'`, so an indexer self-reporting "degraded" while serving good rows blanks everything. The author's own comment at `DaoService.ts:169-173` names this exact hazard and fixes it **for `getDao` only**, leaving every other read gated. Note also `.env:29` sets `VITE_INDEXER_HEALTH_URL=http://localhost:8080/health` — Vite inlines env at build time, so a locally-built production bundle embeds a localhost health URL every visitor's browser will fail.

**Fix:** Stop gating Supabase reads on a separate endpoint — mirror the `getDao` pattern: try the query, fall back on throw. Delete the bare `catch {}` blocks where no on-chain fallback exists so `isError` UI and React Query's retry engage; call the on-chain fallback in the catch where one does exist.

---

### ST4 — Voting sidebar quorum meter uses the wrong numerator and denominator vs `_didProposalPass`
**Severity: Medium** · `src/components/proposal/VotingSidebar.tsx:107-114` · **Effort: S**

```ts
const maxShares = safeBigInt(proposal.max_total_shares_and_loot_at_vote)
const quorumThreshold = maxShares > 0n ? (maxShares * quorumBps) / 10000n : 0n
const participation = yesBalance + noBalance
const quorumMet = quorumThreshold > 0n && participation >= quorumThreshold
```

The contract (`DAOShip.sol:1195-1210`) measures `prop.yesBalance >= (prop.maxTotalSharesAtSponsor * quorumPercent) / BASIS_POINTS_DIVISOR` — yes-only numerator against the **shares-only** sponsor snapshot. The sidebar uses yes+no against the **shares+loot** high-water mark, which also floats upward during voting. `willProposalPass` (`types/proposal.ts:236-246`) uses the correct field, so the same page shows two contradictory verdicts.

**Failure:** 1000 shares + 4000 loot, quorum 20%. Contract threshold = 200 yes-shares. yes=100, no=900 → sidebar computes threshold 1000, participation 1000, renders **"Quorum: Reached"** in green. Contract state is `Defeated`. Loot-heavy DAOs systematically report quorum as unreachable.

**Fix:** Export a single `quorumStatus(proposal, quorumBps)` from `types/proposal.ts` and call it from both sites.

---

### ST5 — Launch/deploy pipeline cannot recover a transaction whose receipt is lost
**Severity: Medium** · `ReviewStep.tsx:217, 324, 363` · `DaoService.ts:774-794` · `NavigatorDeployService.ts:227-243` · **Effort: M**

The pipeline's only record of success is the resolved value of the step's promise. Nothing captures a tx hash before awaiting, and there is no existence probe — `grep getCode src/services src/components/launch src/hooks` returns only `ContractMetadataService` and a comment, even though `verifyContractDeployments` (`contracts.ts:169`) has a working `quai_getCode` helper and `salts.daoShip.address` is persisted in state.

Three concrete manifestations:

- **Launch step:** any break in `tx.wait()` (dropped connection, tab reload, wallet "speed up" changing the hash) or the `throw new Error('LaunchDAOShipAndVault event not found in transaction receipt')` at `DaoService.ts:794` leaves `launchResult: null` while the DAO is deployed. Both "Retry this step" (`:515`) and "Resume" (`:606`) re-broadcast the **same CREATE2 salts** (`DAOShipAndVaultLauncher.sol:139-162`), which must revert on collision. The predicted DAO address is sitting in state and is never shown to the user. Only "Start Fresh" proceeds — mining new salts and paying for a second full launch.
- **Navigator deploy:** post-deploy verification reads (`navigatorType()`, `daoShip()`) are unguarded. A transient RPC error is indistinguishable from a genuine type mismatch, the method throws, and `address` — the only record of a ~1.4M-gas contract — is discarded. Retry deploys a duplicate and orphans the first (whose allowlist Poster post never ran).
- **`submitProposal`:** `value: effectiveOffering` is committed on send (`DaoService.ts:594`); any `tx.wait()` rejection surfaces via `NewProposal.tsx:244` as a plain form error with the form intact and Submit re-enabled. A retry creates a duplicate proposal and pays a second offering.

There is also no `beforeunload` guard anywhere (`grep beforeunload src/` → nothing) during a 3–4 transaction pipeline, and no `tx.wait()` call passes a timeout (11 sites in `DaoService`, ~20 in `NavigatorService`).

**Fix:** Persist `tx.hash` per step **before** awaiting the receipt; on retry/resume, re-fetch that receipt first. Probe `salts.daoShip.address` with `quai_getCode` before running the launch step and reconstruct `launchResult` from the predicted addresses if code is present. Wrap navigator post-deploy verification in try/catch and return `{ address, verified }` so a read failure never discards a paid-for address. Add a `beforeunload` guard while the pipeline is mid-flight, and pass a confirmation timeout to `tx.wait()`.

---

### ST6 — `parseTokenAmount` is undefined in `SubscriptionPlugin`, and a bare catch hides the `ReferenceError`
**Severity: Medium** · `src/components/navigator/plugins/SubscriptionPlugin.tsx:589` · **Effort: Trivial**

```ts
const amountWei = (() => { try { return amount ? parseTokenAmount(amount) : 0n } catch { return 0n } })()
const valid = tokenValid && toValid && amountWei > 0n
```

The file imports only `formatTokenAmount` (line 23). `tsc` reports `TS2304: Cannot find name 'parseTokenAmount'`; esbuild ships the free identifier (verified: `grep -o parseTokenAmount dist/assets/NavigatorDetail-*.js` finds exactly one occurrence, the call site, with no binding). The `ReferenceError` is swallowed, `amountWei` is always `0n`, `valid` is permanently false, and the Propose link stays `pointer-events-none opacity-50` with no error text and nothing for the ErrorBoundary to catch.

This is the flagship example of the no-op-`tsc` problem: `SubscriptionPlugin` ships its own `WithdrawStuckTokensButton` instead of `NavigatorAdminActions` (which imports the helper correctly at `:6/:101`), so this is the only in-app recovery UI for that navigator type — though a hand-built custom-action proposal still works.

**Fix:** Add the import; narrow the catch so a programmer error is not indistinguishable from bad user input; fix the build (**ST7**).

---

### ST7 — `tsc` is a no-op; 51 type errors ship and there is no CI
**Severity: Medium** · `package.json:7` · `tsconfig.json` · **Effort: S (+ M to clear the errors)**

`"build": "tsc && vite build"`. Bare `tsc` resolves `tsconfig.json`, which is `{"files": [], "references": [...]}` — without `-b`, references are not traversed and `files: []` means zero inputs. Verified: `npx tsc --listFiles` emits nothing and exits 0. `npx tsc -b --force` reports **51 errors**.

There is no `.github/`, no CI config of any kind, and `vercel.json` declares no `buildCommand`, so this script *is* the gate. `lint` and `test:run` have no invoker (though both currently pass, so the human gate is working for those — the demonstrated damage traces entirely to the inert `tsc`).

Roughly 10 of the 51 errors are in dead files (`ProposalStatusBadge.tsx:13` TS2741, four `NavigatorDetailCard.tsx` TS2339 — both files unreferenced), which actively misdirects triage away from the one live `ReferenceError`. Deleting dead code first (**SU1**) makes the remainder actionable.

**Fix:** `"build": "tsc -b && vite build"` — but it must land **with** the error fixes or deploys break. Add `.github/workflows/ci.yml` running `npm ci && npm run lint && npm run test:run && npm run build`.

---

### ST8 — Client-side governance validation diverges from the contract in five places
**Severity: Medium** · **Effort: S each**

| # | Location | Divergence | Consequence |
|---|---|---|---|
| a | `GovernanceStep.tsx:24`, `GovernanceForm.tsx:113-118` | Only lower bounds checked. `MAX_VOTING_PERIOD`/`MAX_GRACE_PERIOD`/`SponsorThresholdExceedsSupply` exist in `DAOShip.json:84,239,259` and are referenced nowhere in `src/`. Only bound applied is uint32 (~136 years). | Proposal passes a full voting+grace cycle, then reverts at `processProposal`. Offering burned, lands as `ActionFailed`. |
| b | `ProposalActions.tsx:82` | Compares raw `dao.sponsor_threshold`; contract uses `_effectiveSponsorThreshold() = min(threshold, sharesTotalSupply)` (`DAOShip.sol:1667-1673`). | Threshold > supply (post-ragequit, or shares minted after governance setup) → Sponsor button hidden for everyone, no proposal can ever be sponsored through the app. |
| c | `ProposalActions.tsx:83` | `canVote` never checks voting power at the `votingStarts` snapshot; contract requires `getPriorVotes(msg.sender, prop.votingStarts) != 0`. | Every member onboarded mid-vote (and every zero-share connected wallet) sees enabled Vote buttons that revert at gas estimation. |
| d | `RagequitModal.tsx:206` | `min_retention_percent` appears nowhere in the file; contract reverts `InsufficientRetention` (`DAOShip.sol:1573-1574`). Data is available on `dao` and `totalSupply` is already passed in. | "Burn All" fails for a whale in a retention-configured DAO with no discoverable cap. Default is 0, so only deliberately-configured DAOs are affected. |
| e | `types/proposal.ts:147, 173` | `deriveProposalStatus` returns `Submitted` before checking explicit expiration (contract checks expiration first, `DAOShip.sol:760-763`), and applies M-7 auto-expiry without a pass check (contract short-circuits to `Defeated` at `:778`). | Expired unsponsored proposals advertise a Sponsor button that always reverts; failing proposals flip to `Expired` and lose their Process affordance, though on-chain they remain closeable forever. |

**Fix:** Read `MAX_VOTING_PERIOD()`/`MAX_GRACE_PERIOD()` (already in the ABI) into `GovernanceEncoder` constants and enforce in both forms. Cap the sponsor threshold at `dao.total_shares`. Add a `getPriorVotes(address, voting_starts)` hook alongside `useHasVoted`. Pass `min_retention_percent` in and clamp `burnAll`. Reorder `deriveProposalStatus` to mirror the contract exactly.

---

### ST9 — On-chain fallbacks are systematically lossy
**Severity: Medium** · `src/services/DaoService.ts:983, 1084, 1107-1125` · **Effort: S**

Three separate bugs in the indexer-outage read path:

- **`getProposalsFromChain` silently truncates to the 20 newest** (`:983`). The comment says *"batch of up to 20 to avoid RPC overload"* but there is no outer batch loop — `start`/`end` are computed once and the single batch is the complete list. On a 60-proposal DAO during an outage, proposal #7 is simply gone with no truncation indicator.
- **`max_total_shares_at_sponsor` written into the wrong field** (`:1084`): `max_total_shares_and_loot_at_vote: p.maxTotalSharesAtSponsor` — right number, wrong slot, and the correct field is left undefined. `willProposalPass` reads `BigInt(max_total_shares_at_sponsor || '0')`, so quorum silently collapses to 0. Currently inert (both branches of `ProposalDetail.tsx:181` evaluate to `'0x'` because `proposal_data` is also null on this path), but it is a booby trap for any future change.
- **`voting_power: '0'` after fetching it** (`:1107-1125`): `getCurrentVotes` is awaited into `_currentVotes` and thrown away. Every governance gate (`ProposalActions.tsx:82`, `ProposalDetail.tsx:82`) reads this field, so a member holding 100% of shares cannot sponsor during an outage. One-line fix.

**Fix:** Loop batches to `proposalCount` and return `{items, truncated}`. Assign both snapshot fields correctly. `voting_power: _currentVotes.toString()`.

---

### ST10 — Launch and proposal forms have no numeric validation; strict parsers fail mid-pipeline
**Severity: Medium** · `MembersStep.tsx:73, 90` · `GovernanceStep.tsx:53-54` · `LaunchWizard.tsx:251` · `TransactionBuilder.tsx:506` · `FundingForm.tsx:68` · **Effort: S–M**

`useForm` (`LaunchWizard.tsx:212`) has **no resolver** — the zod `launchFormShape` is used only for localStorage restore and is all `z.string().default()`. `validateCurrentStep` case 1 is literally `return trigger('members')`, which runs only the address validator. So `shares`, `loot`, `proposalOffering`, `sponsorThreshold`, `lootMultiplier`, `mintCap`, `perAddressCap` are unvalidated free text feeding strict `BigInt`/`parseTokenAmount` calls. Verified behaviours: `"1,000"` → `throw "Cannot convert 1,000000000000000000000 to a BigInt"`; `"1.5"` for a bps field → `SyntaxError`; `"0.0000000000000000001"` → silently `0n` (a member minted zero shares); `"  "` → `0n`.

The failure surfaces *after* salt mining and after navigator deploys have been paid for, as a raw engine message in a pipeline step. Meanwhile `navigatorValidation.ts` already defines `onboarderMultiplierSchema`/`onboarderFixedPriceSchema`/`erc20TributeSchema`, unit-tested, imported by **zero** components — while the sibling `signal`/`timelock`/`subscription` schemas *are* wired into `NavigatorCatalog.tsx:637/678/716`. Same DAO, two navigator-creation paths, two validation grades.

Related:
- **`TransactionBuilder.tsx:506`** — `const finalData = selectedFn ? (encodedData ?? '0x') : '0x'` with an unconditional emit. When `encodeFunctionData` throws, the action still emits `{to, value: valueWei, data: '0x'}` with the summary `Call <fn>()`. `CustomActionForm.validate()`'s only calldata rule (`:126`) requires `value === '0'`, so a payable call with a mistyped param becomes a bare value transfer to the contract's fallback, labelled as a function call. **This one has genuine fund-loss potential.**
- **`FundingForm.tsx:68`, `MembershipForm.tsx:92`** — `Number(amount) <= 0` lets `NaN` through; the keystroke filter `/^\d*\.?\d*$/` admits `"."`, and `Number('.')` is `NaN`.

**Fix:** Wire the existing zod schemas into `validateCurrentStep` case 3 and add `rules: { validate }` to the shares/loot/offering/threshold registrations with `/^\d+(\.\d{1,18})?$/`. Suppress `TransactionBuilder`'s emit while `encodedData === null && selectedFn !== null`, and have `CustomActionForm.validate()` reject any action whose builder reported an encoding error. Replace `Number(x) <= 0` with a try/parse on the bigint.

---

### ST11 — Lossy display round-trips feed transactions
**Severity: Low–Medium** · `GovernanceForm.tsx:79-80, 152-153` · `RagequitModal.tsx:227, 305, 347` · **Effort: S**

`formatTokenAmount` truncates (`format.ts:43`, `.slice(0, maxDecimals)`) and the truncated **display string** is re-encoded on submit:

- **Governance form** prefills all seven fields at 4 decimals and `setGovernanceConfig` rewrites all seven. `formatTokenAmount(5e13n, 18, 4, 0)` returns the literal string `"0."`, which `parseTokenAmount` maps to `0n` — a member extending the voting period silently zeroes the DAO's anti-spam proposal offering. Any threshold beyond 4dp is shaved.
- **Ragequit "Burn All"/"Max"** sets `formatTokenAmount(userShares)` (4dp) and submits the re-parsed value. A member with 1.23456789 shares burns 1.2345 and keeps dust they can never clear — and the confirm screen renders the residual as `"0.000"`, so nothing on screen reveals the shortfall.

**Fix:** Keep raw wei in state alongside the display string; submit the original bigint for any untouched field, or prefill at full precision (`maxDecimals = 18`).

---

### ST12 — Modal focus-restore fires on every parent re-render
**Severity: Low–Medium** · `src/components/common/Modal.tsx:85-91` · **Effort: S**

The effect cleanup calls `previousFocusRef.current?.focus()` unconditionally, and its deps are `[isOpen, handleKeyDown]` where `handleKeyDown` is a `useCallback` over `[onClose, preventClose]`. Callers pass inline arrows (`Members.tsx:634`), so every parent render mints a new identity, tears the effect down **while `isOpen` is still true**, focuses the trigger button behind the modal, then the `requestAnimationFrame` at `:78-83` re-focuses the dialog's first focusable node.

**Failure:** A member typing into "Shares to Burn" while `useMembers` (30s), `useMember` (15s) and realtime pushes re-render `Members` gets their caret yanked onto the Close (X) button; the next Enter destroys the entry. During `preventClose` every focusable is disabled, so `first?.focus()` no-ops and focus lands **outside** the open `aria-modal` dialog.

The codebase already has the right pattern: `RagequitModal.tsx:149-163` uses a `prevOpenRef` guard for exactly this.

**Fix:** Split the keydown listener into its own effect; put the focus restore in an effect keyed only on `isOpen`, guarded by a was-open ref.

---

### ST13 — Lower-severity stability items (batch)
**Severity: Low** · **Effort: Trivial–S each**

| Item | Location | Issue |
|---|---|---|
| Salt-mining cancel deadlocks the pipeline | `SaltMiner.ts:292-298` | `cancel()` terminates the worker without settling the `mineAllSalts` promise, so `await mine(...)` hangs, `finally { setMining(false) }` never runs, and `ReviewStep.tsx:198`'s `if (!mineResult)` cancel branch is dead code. Also no unmount cleanup and no re-entrancy guard (`SaltMiner.ts:165` overwrites the worker handle). |
| Navigator config loader turns every failure into `type:'unknown'` | `NavigatorService.ts:279-281` | Silent catch over the `getProvider()` throw + all eight config loaders, returning a *resolved* value so React Query caches it as success for 5 minutes. Dominant trigger is a disconnected wallet: `NavigatorDetail.tsx:103` (`configResult?.type \|\| navigator.navigator_type`) then shadows the correct indexer type and renders `UnknownPlugin` ("not yet supported") above a Type field reading `BudgetNavigator`. Nothing invalidates on `setSigner`, so it persists the full staleTime. |
| Query hooks read `baseService.hasProvider()` non-reactively | `useTokenMetadata.ts:15` + 8 more sites | Imperative read of a module singleton with no subscription; the provider installs after wagmi's `isConnected` flips. Masked by incidental re-renders. Add a `providerReady` flag to `walletStore`. |
| Launch affordability gate bypassed for 30s after connect | `useLaunchCost.ts:126-129` | `enabled: isConnected` fires before the provider exists; `{gasPrice: null, balance: null}` is a *successful* query cached 15s/30s, and `insufficient` evaluates false. Treat unknown cost as blocking. |
| Vote-list invalidations target a nonexistent query key | `useVoting.ts:19`, `useRealtimeVotes.ts:18` | Both invalidate `['votes', ...]`; the only query is `['proposalVotes', compositeId]`. The realtime channel is inert — the votes panel is frozen at mount while the tally header polls, so the two visibly disagree. |
| `hasVoted` never repaired past a 4s retry | `useHasVoted.ts:13` | No `refetchInterval`, `refetchOnWindowFocus: false`, and it resolves from the indexer (returning `false`, not an error, while un-ingested). With >4s indexer lag the Vote buttons re-enable. Add `setQueryData(['hasVoted',…], true)` optimistically. |
| `ErrorBoundary` never resets and doesn't cover the shell | `ErrorBoundary.tsx:23`, `App.tsx:30-34` | `hasError` clears only via `window.location.reload()`; the boundary sits *inside* `Layout`, so sidebar links change the URL while the fallback persists, and a throw in `Header`/`ConnectModal` white-screens. Compounded by 12 `React.lazy` routes with no chunk-load retry under `immutable, max-age=31536000` (`vercel.json:43`) — a redeploy strands open tabs. |
| `TransactionErrorHandler` is dead code | `TransactionErrorHandler.ts:165, 173` | `formatTransactionError`/`isUserRejection` have zero callers; every write path stringifies raw errors (`NewProposal.tsx:244` ×10, `RagequitModal.tsx:254`, `pluginErrors.ts:14`). A deliberate Pelagus cancellation renders identically to a hard failure. |
| Unguarded `name()` breaks the permit fallback | `NavigatorService.ts:563-566` | Every other probe failure returns `false` so the caller degrades to approve+onboard; this one propagates and aborts onboarding. Also: permit deadline from `Date.now()` with no chain reference (`:601`) and no fallback after `signTypedData` succeeds; and the UI promises "Sign & Join" from a `nonces()`-only probe (`ERC20TributePlugin.tsx:174`) that the service's stricter test may reject. |
| Vault owners auto-populated with no duplicate check | `LaunchWizard.tsx:330` | `QuaiVault` reverts `DuplicateOwner` (selector `bc7bc454` confirmed in deployed bytecode); `MAX_OWNERS` is in the ABI and never read. |
| "Cancel Proposal" has no confirmation | `ProposalDetail.tsx:377` | Terminal on-chain action, single click to wallet. `ConfirmDialog` exists and is used for the *less* destructive submit path (`NewProposal.tsx:831`). |
| Expiration placeholder suggests a unit the parser rejects | `ProposalSettingsFields.tsx:70` | `'None (e.g. "7 days", "2 weeks")'` — `parseDurationToSeconds` (`time.ts:133-135`) has no week unit, returns `null`, and `NewProposal.tsx:294-299` maps that to `0` (the contract's use-default sentinel) with no error rendered. |
| `assertCorrectChain` wired into writes only | `BaseService.ts:26, 75-92` | 2 references total (definition + `requireSigner`). All 93 `getProvider()` read sites query whatever chain the wallet is on. No `switchChain`, no `wallet_switchEthereumChain`, no chain field in `walletStore` — the only wrong-network read signal is zeros. |
| Signer-bridge failure swallowed to console | `useWallet.ts:94-97` | UI stays "connected" with `baseService.signer === null`; every write dies with "Wallet not connected". Also skips `verifyContractDeployments`. |
| Startup validation throws before render | `main.tsx:9` | Top-level `validateContractConfig()` throws in PROD before `createRoot().render()`; `#root` has no fallback markup and the ErrorBoundary is inside `App`. A bad `VITE_*` address = permanent white page with no signal. |

---

## 3. Scalability

### SC1 — Every indexer list query is hardcoded-capped or unbounded, with all pagination client-side
**Severity: Medium** · `ProposalIndexerService.ts:22-27` · `DaoIndexerService.ts:14-26, 64-82` · `RecordIndexerService.ts:112-118` · `MemberIndexerService.ts:18-23` · `VoteIndexerService.ts:19-24` · `SubscriptionIndexerService.ts:23-31` · **Effort: M**

`grep -rn "\.range(" src/` returns **nothing**. There is no offset or cursor pagination anywhere. Concrete manifestations:

| Query | Cap | Consequence |
|---|---|---|
| `listProposals` | `.limit(200)` | `Proposals.tsx:146` paginates client-side at 20/page → hard ceiling of 10 pages. Tab badge counts and `Members.tsx:198-205` sponsored-counts are computed over the truncated window. Deep links still work (`getProposal` is by-id). |
| `listDaos` | `.limit(200)` | Accepts a `search` param implementing server-side `ilike` — **never called** (sole call site `DaoService.ts:191` passes nothing). `Explore.tsx:56` filters the truncated array in memory, so past 200 DAOs the oldest are undiscoverable *and* unsearchable by exact name. |
| `getMemberProfiles` | `.limit(200)` on **records, not members** | Every profile *edit* adds a row, so distinct members covered is ≤200 and shrinks with churn. Uniquely among the queries in this file, it applies **no `trust_level` filter** (contrast `:25`, `:73`, `:161`). Uncovered members render as bare hex and become unfindable in the delegate-by-name typeahead (`Members.tsx:219-223`). |
| `listMembers` | **none** | Entire active-member table transferred, polled every 30s, sorted with `safeBigInt` parsing *inside* the comparator (`Members.tsx:298`) to render 25 rows. `getActiveMemberCount` already exists at `:57-69` — the count query for server-side paging is right there. |
| `getProposalVotes` | **none** | Consumed at exactly one place for a single `.find()` (`ProposalDetail.tsx:91-92`), and it runs for every viewer regardless of whether they delegated. |
| `getDaosByMember` | **none**, two round-trips | Manual client-side join serialising every `dao_id` into a GET URL. Also omits the `shares.gt.0,loot.gt.0` predicate `listMembers` uses, so DAOs the user fully ragequit out of persist in "My DAOs" forever. |

**Fix:** Add `{limit, offset}` (or keyset on the ordering column) to each service method mapping to `.range()`, driven by the page state that already exists in each view; take totals from `{count: 'exact', head: true}`. Thread `Explore`'s debounced search to `listDaos(search)`. Key profile fetches off the visible member page (`.in('user_address', pageAddresses)`) or a latest-per-member view, and add the missing `trust_level` filter. Replace `getDaosByMember`'s manual join with a PostgREST embedded select.

---

### SC2 — Full proposal table (`select('*')` incl. `proposal_data` + attacker-authored `details`) re-downloaded every 10s
**Severity: Medium** · `ProposalIndexerService.ts:24` · `useProposals.ts:17-18` · **Effort: S**

`.select('*')` over up to 200 rows including `proposal_data` (multisend calldata hex) and `details` (free-form JSON, permissionlessly attacker-authored), polled at `staleTime: 8000, refetchInterval: 10000` from three mount points (`Proposals.tsx:127`, `Members.tsx:117`, `Overview.tsx:46` — shared query key, so one poll). Every refetch also runs the whole body through `quoteUnsafeIntegers` (`jsonBigInt.ts:36+`), a character-at-a-time scanner doing `out += ch` before `JSON.parse` — the dominant cost at scale, and unavoidable in the fetch layer regardless of memoization.

Note `proposal_data` *is* used by list views (`Proposals.tsx:70` → `proposalTypes.ts:53` → `decodeProposalActions`), so it cannot simply be dropped — but `getProposalType` returns early from `details.type` for every proposal the app itself submits, so the decode is only needed for externally-authored rows.

**Fix:** Explicit column list for the list query; fetch `proposal_data` lazily only when `details.type` is absent. Cap/truncate `details` before parsing. Raise the list `refetchInterval` to 30s to match the members poll.

---

### SC3 — N+1 provider calls with no batching, concurrency cap, or windowing
**Severity: Low** · `ClaimedTokensGallery.tsx:77, 111` · `NavigatorIndexerService.ts:101-116` · **Effort: M**

Each `ClaimCard` mounts `useNftTokenImage`, which does one `tokenURI` eth_call through the single wallet provider plus one gateway fetch. All cards commit together — N concurrent calls into Pelagus, which serialises them. `getNftClaims` is `.select('*')` with no limit. Mitigated: the gallery is collapsed by default and results cache 10 minutes. `@tanstack/react-virtual` is installed and its only import is in dead code (**SU1**).

**Fix:** Add `.limit()`/`.range()` to `getNftClaims`; window the gallery with the already-installed virtualizer; cap tokenURI read concurrency.

### SC4 — Merkle tree reloaded and re-validated three times per render
**Severity: Low** · `useNavigatorAllowlist.ts:107-115, 133-137` · **Effort: S**

`StandardMerkleTree.load` sits in the hook body with no `useMemo`, and `load()` calls `validate()`, which re-hashes every leaf and re-verifies every internal node. Two more loads happen per render via `checkAddress` → `getAllowlistProof` → `allowlist.ts:82`, called *during render* in three plugins and again in `NavigatorAllowlistStatus.tsx:36`. Measured with the installed library: 17.6 ms per render at the app's 50-address cap (above the 16.7 ms frame budget), 1.77 s at 5,000 addresses (reachable via restored backups, which have no cap). Only affects navigators with a non-zero `allowlistRoot`.

Separately, `AllowlistInput.tsx:20-24` builds the tree even when `overLimit` is already true (`:18` computes it and never consults it before building).

**Fix:** `useMemo` the loaded tree on `treeDump`; have `checkAddress`/`getProof` close over it. Short-circuit the `AllowlistInput` memo on `addresses.length > MAX_ALLOWLIST_ADDRESSES`.

### SC5 — `ds_indexer_state` realtime refetches instead of using the pushed payload, and is the only realtime hook without a debounce
**Severity: Low** · `useIndexerState.ts:37-51` · **Effort: Trivial**

The table is in the publication with `REPLICA IDENTITY FULL`, so the broadcast carries the whole row — yet the handler discards it and issues a fresh PostgREST GET. Every sibling hook wraps its handler in `useDebouncedCallback`. `Header` mounts this on every route. Steady state is ~one extra single-row GET per 5s per tab; a backfill bunches them.

**Fix:** `queryClient.setQueryData(['indexerState'], payload.new)` in the handler, wrapped in `useDebouncedCallback`; keep `invalidateQueries` only for the `SUBSCRIBED` resync.

---

## 4. Efficiency

### E1 — WalletConnect + Reown AppKit downloaded and initialised on every page load for a path that is CSP-broken
**Severity: Medium** · `src/config/wagmi.ts:58-60` · `src/App.tsx:30` · **Effort: M**

`WagmiProvider` is mounted without `reconnectOnMount={false}` (defaults `true` per `wagmi/dist/esm/hydrate.js:5`), so `@wagmi/core`'s `reconnect()` loops `await connector.getProvider()` over **every** connector with no early break. The WalletConnect connector's `getProvider` dynamic-imports `@walletconnect/ethereum-provider` and runs `EthereumProvider.init({showQrModal: true})`, whose init body imports `@reown/appkit/core`. Measured against the build: ~1.0 MB raw / ~306 KB gzip fetched, parsed and initialised on every visit — for a connector that cannot connect in production (**S5**). The modal UI chunks are lazy and the relay socket is skipped with no topics, so no third-party connection is made; the cost is pure bandwidth/parse/CPU.

`vite.config.ts:20-26` names only three manual chunks, leaving four unnamed chunks (`core` + three `index-*`) totalling 1.65 MB raw / 475 KB gzip uncovered.

**Fix:** Decide whether WalletConnect is supported on Quai. If yes: fix the CSP, pass `reconnectOnMount={false}` and call `reconnect(config, {connectors: [injected]})` yourself, set `showQrModal: false` and render the QR from the `display_uri` event. If no: delete the connector and reclaim ~1 MB plus three dependencies.

### E2 — All 8 navigator bytecodes (101 KB hex) in one chunk that `/launch` statically imports for 2 of them
**Severity: Low** · `NavigatorDeployService.ts:3-18` · **Effort: M**

Eight `*.bytecode.ts` files + eight ABI JSONs at module scope. Verified by substring-matching each creation blob against the build: all 8 land in `dist/assets/NavigatorDeployService-*.js` (161,953 B raw / 39.4 KB gzip), statically imported by `Launch-*.js`. `NavigatorsStep.tsx` exposes only `enableOnboarder` and `enableERC20Tribute`. On the Navigators/NavigatorDetail routes the colocation is correct (`NavigatorCatalog` uses all eight), so the avoidable payload is ~25–30 KB gzip on one lazy route.

**Fix:** Per-type dynamic import inside each deploy method.

### E3 — Wasted renders and duplicate mounts
**Severity: Low** · **Effort: Trivial–S each**

| Item | Location | Issue |
|---|---|---|
| `NotificationContainer` mounted twice | `Layout.tsx:36` + `App.tsx:61` | Both subscribe to the singleton manager and render the same fixed-position stack. Dismissal is global so there is no orphan-toast artifact, but there are duplicate `aria-live` regions (double screen-reader announcements) and redundant renders. Delete one. |
| `memo(VotingSidebar)` fully defeated + mounted twice | `ProposalDetail.tsx:359, 373-377, 393` | Three inline arrows plus a freshly-built `actionErrors` array (`:183`) change identity every render. Both desktop and mobile copies are always mounted (CSS-only `hidden lg:block`), so two 1-second countdown intervals run, one off-screen. |
| Whole-store zustand subscriptions | `useWallet.ts:22`, `Home.tsx:21`, `Header.tsx:17`, `BottomNav.tsx:39` | zustand v4 defaults to the identity selector, so these re-render on *any* store mutation despite only using stable action functions. `ConnectModal.tsx:22-24` and `useDaoTheme.ts:17` show the correct form. |
| `RagequitModal` mounted unconditionally | `Members.tsx:631-649` | Whole body + hooks run on every `Members` render; `guildTokens` is rebuilt as a fresh array of fresh objects each time, invalidating its memos. Cheap today (treasury queries are gated on `ragequitOpened`), but the mounting is wrong. |
| `usePageVisibility` × 17 independent listeners | `usePageVisibility.ts:14` | Each call site gets its own `useState` + `document.addEventListener`. Convert to a `useSyncExternalStore` singleton. |
| `useWallet` signer bridge + 9-contract verification per hook instance | `useWallet.ts:29, 32, 79` | `signerRef`/`verifiedChainRef` are per-instance, and 15 call sites mean ~3–4 concurrent instances per route. A fresh mount starts with `verifiedChainRef.current === null`, so the guard never suppresses it — every navigation re-runs the full `quai_getCode` sweep. Hoist to app level. |
| `QuaiVault.json` is a 124 KB Hardhat artifact | `budgetProposals.ts:14` +3 | 86 KB of `bytecode`/`deployedBytecode` (tree-shaken from prod, but read+parsed by dev server and `tsc` on every cold start). Every other file in `config/abi/` is a bare array. Strip to `.abi`. |
| Dead dependencies | `package.json` | `@hookform/resolvers` and `@tanstack/react-virtual` (only import is dead code) have zero live usage; devDeps `sharp` (33 MB of `@img/*` binaries, no script references it) and `@types/dompurify` likewise. Note `@wagmi/core` and `@walletconnect/ethereum-provider` *do* load at runtime via the wagmi connector — do not remove those unless E1 removes the connector. |

---

## 5. Succinctness

### SU1 — 26 unreferenced files (3,135 LOC), including two that inflate the tsc error budget
**Severity: Low** · **Effort: S**

`npx knip` reports exactly 26 unused files totalling 3,135 lines. Notable: `NavigatorDetailCard.tsx` (614 LOC, source of 4 TS2339 errors), `ProposalStatusBadge.tsx` + `MemberCard.tsx` (transitively dead via `ProposalCard.tsx`/`MemberList.tsx`, source of the TS2741 `ActionFailed` error), `LauncherService.ts` (126 LOC), `src/utils/validation.ts` (193 LOC, every exported schema dead), plus `MemberList.tsx` which carries a **second, divergent copy** of the member-sorting logic (`Number(BigInt(b.shares) - BigInt(a.shares))` — would overflow `Number` on 18-decimal balances).

Deleting these removes ~10 of the 51 tsc errors, which is a prerequisite for making the remaining list triageable. Also `registerNavigatorPlugin` (`plugins/index.ts:17`) is a registry API whose only 8 callers are literal calls at the bottom of its own file, statically importing 4,651 LOC of plugins.

**Fix:** Delete the 26 files. Replace the registry with `const NAVIGATOR_PLUGINS = { OnboarderNavigator: lazy(() => import('./OnboarderPlugin')), … } as const`.

### SU2 — 9 realtime hooks are one 40-line body copy-pasted, and have already drifted
**Severity: Low** · `useRealtimeBudgets/Members/Proposal/Proposals/Records/Subscriptions/TimelockChanges/VestingSchedules/Votes` · **Effort: S**

400 LOC of byte-identical effect bodies varying only in channel name, table, filter and query keys. Two of the nine debounce (`useRealtimeMembers.ts:16`, `useRealtimeVotes.ts:17`, with an explicit comment about collapsing bursts); seven do not. All nine carry the same `TS18047 'supabase' is possibly null` error because the null guard is hand-rewritten each time.

**Fix:** One `useRealtimeTable({channel, table, filter, queryKeys})` that narrows the client once and always debounces. 400 LOC → ~90, and 9 type errors disappear with one narrow.

### SU3 — Duplicated logic that has already diverged
**Severity: Low** · **Effort: S–M**

| Duplicate | Sites | Drift |
|---|---|---|
| Navigator deploy pipeline | `NavigatorCatalog.tsx:465-560` vs `ReviewStep.tsx:205-305` | Catalog guards the tribute token with `isValidCyprus1Address` + `tokenService.verifyERC20`; the launch path has neither (`grep` returns nothing). Same for the `invalid.length` allowlist gate (**S8**). |
| 8 `deployXNavigator` methods | `NavigatorDeployService.ts:184, 254, 304, 353, 400, 445, 492, 582` | 7 verify `daoShip()` matches; `deployERC20TributeNavigator` (`:283`) checks only `navigatorType()`. Two use `Promise.all`, others sequential awaits. |
| `isPaused` derivation | 7 plugins | 5 OR the indexer flag (`indexerPaused \|\| config.paused`); `VestingPlugin.tsx:114` and `TimelockPlugin.tsx:102` use only the on-chain read and never touch `navigator.paused`, so a paused vesting navigator whose config read failed renders "New schedules: Open" with a redundant Propose-Pause button. |
| `buildCustomActionHref` | `customActionHref.ts:24` vs `navigatorAdminProposals.ts:77` | Line-for-line copy; the shared module's own header claims to be the single source of truth for this query-param contract, and 4 of 5 builders import it. |
| `STANDARD_LINKS` | `BasicInfoStep.tsx:15` vs `ProfileForm.tsx:56` | Labels/placeholders already drifted ("X / Twitter" vs "Twitter / X"). Same `links` data contract. |
| `formatPct` | `Members.tsx:46` vs `DelegateCard.tsx:27` | Byte-identical. |
| 46 Supabase query preambles | 11 indexer services | Each hand-types `if (!supabase) return <empty>`, `indexerError('[XService] method', error)` and `(data as T[]) ?? []`. The context string is free text that must be kept in sync by hand — a copy-pasted method carries the previous method's name into the log. |
| 14 indexer-first/fallback try/catch blocks | `DaoService.ts` | Copies disagree on whether an empty result is a miss (`getDaos`/`getMembers`) or authoritative (`getDaosByMember`/`getNavigators`/`getVotes`), invisible without diffing all 14. |

**Fix:** Extract `NavigatorLaunchService.deployFromForm(type, formState, daoAddress)` so both deploy paths share validation; replace the 8 deploy methods with a descriptor table + one `deploy()`; add `useNavigatorPaused(navigator, config)` to pluginShared; re-export the shared href builder; add `indexerQuery<T>(context, builder, empty)` to `indexerError.ts`; add `private read<T>(opts)` to `DaoService` with the empty-result rule as an explicit flag.

### SU4 — God functions / god objects
**Severity: Low** · **Effort: L**

- `NavigatorCatalog.handleDeploy` — 297 lines, 8 branches, in a 1,648-line component. Address validation, on-chain ERC-20 verification, decimals reads in a for-loop, Merkle construction, three zod schemas, 8 deploy calls, Poster writes and a filesystem backup at one altitude. Zero tests reach it (0 test files in `src/components/navigator`).
- `NavigatorService` — 1,287 lines, 45 async methods, all 7 navigator types. Naming is correspondingly inconsistent: `getBudgetConfig`/`getBudgetPaused` beside `budgetPause`/`signalVote`/`erc20TributeOnboard`. Each `get*Config` hand-repeats the same `new Contract` → 10–13-entry `Promise.all` → per-field `BigInt/String/Boolean` remap.
- `DaoService.getOnboarderConfig` (`:518-537`) is dead code that instantiates the **ERC20Tribute** ABI to read an Onboarder and calls `sharePerUnit()`, a method neither ABI exposes. Zero callers. The file header (`:22`) also documents a `daoService.daoShip` accessor that does not exist.

**Fix:** Split navigators by *type* rather than lifecycle: `src/services/navigators/<type>/{config,actions,deploy}.ts` each exporting a `NavigatorAdapter`; `NavigatorService` becomes a registry whose `detectAndLoadConfig` is a map lookup. Delete `DaoService.getOnboarderConfig`.

---

## Prioritised remediation plan

### 1 — Fix now

| # | Item | Findings | Days | Notes |
|---|---|---|---|---|
| 1 | **Add the DAO-address / value / operation guards to `ProposalDecoder`** | S1, S2 | 1.5 | ⭐ **Cheapest high-value item in the audit.** Closes the whole class of voter-facing spoofs in one file. |
| 2 | **Fix the build: `tsc -b && vite build`** + clear the 51 errors | ST7, ST6 | 2.0 | ⭐ Do **SU1 (delete dead code) first** — it removes ~10 errors and stops triage misdirection. Must land with the fixes or deploys break. |
| 3 | **Thread real token decimals through every write path; block on unresolved** | ST1 | 2.0 | ⭐ Five files, one pattern already implemented correctly in six others. Immutable constructor args make the tribute case unrecoverable. |
| 4 | **Ragequit: on-chain guild-token fallback + distinguish "empty" from "failed"** | ST2 | 1.0 | ⭐ `getOnChainGuildTokens` already exists and has zero callers. Irreversible share burn. |
| 5 | Suppress `TransactionBuilder` emit on encoding failure; reject in `CustomActionForm.validate()` | ST10 | 0.5 | ⭐ Prevents a "function call" that is actually a bare value transfer to a fallback. |
| 6 | Fix the CSP: add `.org` relay, `api.web3modal.org`, explorer origin, `ipfs.io` | S5, S9 | 0.25 | ⭐ One line. Unblocks WalletConnect, ABI decode and NFT images — **or** decide to drop WalletConnect, which also delivers E1. |
| 7 | Gate the `||` contract-address defaults on `import.meta.env.DEV`; add URLs + schema to the validator | S6 | 0.5 | ⭐ Makes the existing PROD throw actually reachable. |
| 8 | Trust-status: use `classify()` in `NavigatorDetail`, `NavigatorCard`, `ProposalActionSummary` | S3 | 1.0 | The correct rule is already documented in `navigatorSanction.ts`. |
| 9 | Fix the `VotingSidebar` quorum formula; export one `quorumStatus()` | ST4 | 0.5 | |
| 10 | `voting_power: _currentVotes.toString()` + fix the snapshot field mapping + loop the proposal batch | ST9 | 0.5 | Two of the three are one-liners. |
| | **Subtotal** | | **9.75** | |

### 2 — Next

| # | Item | Findings | Days |
|---|---|---|---|
| 11 | Persist tx hashes; probe `getCode` before retry; guard navigator post-deploy verification; `beforeunload`; `tx.wait()` timeouts | ST5 | 3.0 |
| 12 | Decouple reads from the health endpoint; remove the 14 `catch {}` blocks so `isError` engages | ST3 | 2.0 |
| 13 | Wire the existing zod schemas into `LaunchWizard.validateCurrentStep`; add a resolver | ST10 | 1.5 |
| 14 | Align client validation with the contract (5 sub-items) | ST8 | 2.0 |
| 15 | Server-side pagination (`.range()` + `count: 'exact'`) across all indexer list services | SC1 | 3.0 |
| 16 | Extract `NavigatorLaunchService.deployFromForm`; unify the two deploy paths | SU3, S8 | 2.0 |
| 17 | Fix the `Modal` focus-restore lifecycle | ST12 | 0.5 |
| 18 | Delete 26 dead files; lazy plugin registry; drop dead deps | SU1, E3 | 1.0 |
| 19 | Extract `useRealtimeTable`; fix the `['votes']` key mismatch; debounce all nine | SU2, ST13 | 1.0 |
| 20 | Add `providerReady` to `walletStore`; make the 9 `hasProvider()` sites reactive | ST13 | 1.0 |
| 21 | Narrow the proposal list projection; lazy `proposal_data`; raise the poll to 30s | SC2 | 0.5 |
| 22 | Add CI (`lint` + `test:run` + `build`) with a required status check | ST7 | 0.5 |
| | **Subtotal** | | **18.0** |

### 3 — Opportunistic

| # | Item | Findings | Days |
|---|---|---|---|
| 23 | Lazy-import navigator bytecodes; add manual chunks for the unnamed vendor groups | E2, E1 | 1.0 |
| 24 | Fix the render-waste batch (dup `NotificationContainer`, `VotingSidebar` memo + dual mount, zustand selectors, `usePageVisibility` singleton, `useWallet` hoist) | E3 | 1.5 |
| 25 | Memoize the Merkle tree; window the claims gallery | SC4, SC3 | 1.0 |
| 26 | Wire `TransactionErrorHandler` into every write path; add `isUserRejection` handling | ST13 | 1.0 |
| 27 | Split `NavigatorService` into per-type adapters; descriptor-table `NavigatorDeployService` | SU4, SU3 | 4.0 |
| 28 | Extract `indexerQuery()` and `DaoService.read()` helpers | SU3 | 1.5 |
| 29 | Security hardening batch: image policy, `img-src`, bidi stripping, hash check, allowlist starvation, permit staticCall, IPFS streaming, pipeline zod | S9 | 2.0 |
| 30 | Add tests for `DaoService`, the indexer services, and the governance-math hooks | (systemic) | 4.0 |
| 31 | Remaining low-severity stability batch | ST13 | 2.0 |
| | **Subtotal** | | **18.0** |

---

## Systemic themes

**1. Validation exists on one path and is missing on the parallel path — every single time.**
This is the dominant root cause in this codebase, and it is remarkably consistent. `LaunchWizard` gates on `allowlist.invalid.length` and `NavigatorCatalog` does not. `NavigatorCatalog` calls `verifyERC20` + `isValidCyprus1Address` on the tribute token and `ReviewStep` does not. `navigatorValidation.ts`'s signal/timelock/subscription schemas are wired into the catalog while the onboarder/erc20 schemas — same file, same tests — reach zero components. `CustomActionDetail` requires `navigator_type === 'VestingNavigator'` before trusting a selector decode; the timelock and governance branches next to it check nothing. `NavigatorCard` labels deployer metadata "not governance-approved"; `ProposalActionSummary`, the higher-stakes screen, does not. `parseAllowlistInput` is the only address parser in the app skipping the shard check. Every one of these is the *same author writing the correct thing once and the incorrect thing once*. **The fix is structural, not per-site: extract the shared entry point (`NavigatorLaunchService.deployFromForm`, `isAddress` everywhere, a single trust classifier) so there is only one path to get wrong.**

**2. The decoder builds `DecodedAction` by dropping fields it has already parsed.**
`decodeSingleTx(tx: {to, value, data})` is the whole bug. `operation` is read at line 74 and dropped at 199. `tx.value` survives in exactly two of seven branches. `executeAsGovernance`'s target and value are indexed past. `tx.to` is never checked against anything. Meanwhile the render layer prints confident, reassuring labels — "Mint shares to 1 address", "Queued through the timelock — a second ragequit window" — that are derived from a strict subset of what will execute. This is a single type signature that is too narrow, and widening it fixes S1 and all three parts of S2 at once.

**3. Errors are converted into plausible successes, so failures are indistinguishable from truth.**
`getGuildTokens` → `[]` rendered as "this DAO has no guild tokens configured." `useTreasuryBalances` → `balance: 0n, symbol: '???'` rendered as "(empty)". `detectAndLoadConfig` → a *resolved* `{type: 'unknown'}` that React Query caches as success for 5 minutes and that shadows the correct indexer type. 14 `catch {}` in `DaoService` rendering as "No DAOs have launched yet." `parseTokenAmount` inside `catch { return 0n }` swallowing a `ReferenceError` into a permanently disabled button. `fetchAbiFromExplorer` → `catch { return null }` making a CSP block look like an unverified contract. The team **already built the right abstraction** — `src/services/indexer/indexerError.ts` exists precisely because "views showed an EMPTY state when the indexer was actually down" — and then re-swallowed every throw one layer up. **Rule to adopt: a read helper may return an empty result only when it can prove the source was consulted successfully. Otherwise it throws.**

**4. On-chain state is transactional; the client's record of it is not.**
Nothing in the app captures a transaction hash before awaiting a receipt — not the launch pipeline, not navigator deploys, not `submitProposal`, not votes. `useTransactionFlow`, the one hook written to solve this, has zero consumers. `tx.wait()` is called ~35 times with no timeout. The launch pipeline persists mined CREATE2 salts but not the hash of the transaction that consumed them, so its only retry re-broadcasts a guaranteed-colliding call while the deterministic DAO address sits unused in the same state object. `verifyContractDeployments` has a working `quai_getCode` helper that the launch flow never calls. **The missing abstraction is a `TxTracker` that records `{hash, step, timestamp}` before the await and offers receipt-recovery on resume** — it would close ST5's three manifestations plus the duplicate-proposal and duplicate-navigator cases.

**5. Test coverage is inverted relative to risk, and the build does not type-check.**
343 tests, 5.4% of LOC, concentrated in `src/utils` (15/28 files) and `src/types` (5/16) — the pure, easy, low-consequence code. Zero tests for all 55 hooks, all 12 indexer services, all 12 pages, and the 1,139-line `DaoService`. Combined with a `tsc` that compiles zero files, there is **no automated gate between an editor and production for the entire stateful half of the app**. `SubscriptionPlugin.tsx:589` is the proof: a bare undefined identifier shipped, silently disabled a user-facing recovery flow, and was invisible to lint, tests and build alike. Note that `lint` and `vitest` both pass today — the author clearly runs them by hand — so the incremental value of CI is modest; **the load-bearing fix is `tsc -b`, one word.**

---

## What's healthy

- **The threat model is real and mostly acted on.** `ds_proposals.details` and `ds_records.content_json` are correctly treated as attacker-authored across the render layer; `SafeMarkdown` does no HTML parsing at all; `dangerouslySetInnerHTML` has zero occurrences; `CustomActionDetail` implements an explicit anti-spoofing target check with a comment naming the hazard. The gaps in S1–S3 are omissions from a pattern the team clearly understands, not an absence of one.
- **The Quai-specific constraints are respected consistently.** All RPC goes through the wallet provider (no `JsonRpcProvider` anywhere), no shardless `getBlock('latest')`, Cyprus-1 shard validation on every address field except one, and `verifyContractDeployments` was purpose-built after a real wrong-network incident and re-runs on every chain change.
- **`willProposalPass` correctly mirrors `_didProposalPass`.** The hard part of the governance math — quorum on `yesBalance` against `maxTotalSharesAtSponsor`, no retention term — is right in the canonical implementation. The bugs are in a second, ad-hoc copy in `VotingSidebar`.
- **Lint is clean at `--max-warnings 0`, 343 tests pass, `npm audit` reports 0 vulnerabilities, the dependency tree resolves.** The utils and types that *are* tested are tested well.
- **Realtime, caching and page-visibility gating are thoughtfully done** — `refetchInterval` disabled when hidden, sensible `staleTime` tiers, debounced realtime handlers where they exist, and structural sharing left on.
- **Design intent is documented in-code where it matters.** `navigatorSanction.ts:36-43`, `indexerError.ts:13`, `DaoService.ts:169-173` and `customActionHref.ts` all state the correct rule explicitly. Several findings above are simply "do what this comment says everywhere," which is a much better position than "figure out what the rule should be."

---

*Of 164 candidate findings produced by the audit passes, 14 were refuted on inspection (false code quotes, guards that did exist, unreachable states, or impacts contradicted by the actual call sites) and dropped. Of the 150 that survived, many had their severity reduced during verification — several "critical" claims collapsed on contact with existing mitigations such as `MultiSendCallOnly`, `estimateGasOrThrow` pre-flights, `GasEstimator`'s custom-error decoding, and the `is_active` gate. The severities above reflect verified user and DAO impact, not the original claims.*
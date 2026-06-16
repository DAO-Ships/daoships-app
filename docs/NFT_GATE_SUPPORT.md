# Supporting the NFTGatedNavigator in the app

How to wire DAO Ships' `NFTGatedNavigator` into this app — both the **DAO-creator** flow (configure +
deploy + register) and the **member** flow (onboard with an owned NFT). Contract reference:
`daoships-contracts/docs/NFT_GATE_NAVIGATOR.md`.

> One-line summary of the model: a holder of a specific **ERC-721** collection calls
> `onboard(tokenId)` and receives a fixed amount of shares/loot. **One claim per `tokenId`, forever**
> (claim ticket). Shares persist after the NFT is sold; the buyer of an already-claimed NFT gets
> nothing — so the UI must show per-`tokenId` claim status.

---

## 0. Fix the catalog entry first (it's currently wrong)

`src/config/navigatorCatalog.ts` already has an `NFTGatedNavigator` entry, but it is
`status: 'planned'` and lists features the contract does **not** implement (`ERC-1155 support`,
`Trait-based gating`). Update it:

```ts
{
  type: 'NFTGatedNavigator',
  name: 'NFT-Gated Navigator',
  icon: NAVIGATOR_ICONS.key,
  shortDescription: 'Gate membership behind ERC-721 ownership',
  description: 'ERC-721 holders claim shares/loot — one claim per token, forever',
  permission: 2,
  permissionLabel: 'MANAGER',
  pattern: 'membership',
  status: 'shipped',                       // was 'planned'
  features: [
    'ERC-721 collection gating',
    'One claim per tokenId (anti-recycle)',
    'Free-mint or native tribute',
    'Mandatory mint cap',
    'Per-wallet cap, expiry, allowlist, pause',
  ],
  warningText: 'ERC-721 only. Shares are a claim ticket — they persist after the NFT is sold. Not revocable membership.',
},
```

> Do **not** advertise ERC-1155 or trait gating — both are out of scope (a future
> `ERC1155GateNavigator` will cover amount-based 1155 gating).

---

## 1. Add ABI + bytecode

Match the existing pattern in `src/config/abi/`:

- `src/config/abi/NFTGatedNavigator.json` — the `abi` array from
  `daoships-contracts/artifacts/contracts/navigators/NFTGatedNavigator.sol/NFTGatedNavigator.json`.
- `src/config/abi/NFTGatedNavigator.bytecode.ts` — export the creation bytecode, mirroring
  `OnboarderNavigator.bytecode.ts` (needed by `NavigatorDeployService` for the deploy tx).

You'll also need a minimal **ERC-721** ABI (`ownerOf`, `balanceOf`, optionally
`tokenOfOwnerByIndex`/`supportsInterface`) for the member flow — add `src/config/abi/ERC721.json` or
inline a fragment.

---

## 2. DAO-creator flow — configure, validate, deploy, register

### 2.1 Config type + form

Constructor args (exact order — see contract reference §2):

```
_daoShip, _gateToken, _sharesPerHolder, _lootPerHolder, _requireTribute, _tributeAmount,
_expiry, _mintCap, _perAddressCap, _allowlistRoot, _name, _description
```

Form fields (all amounts in raw wei — 1e18 = 1 whole share/loot; tribute in wei):

| Field | Notes |
|---|---|
| `gateToken` | ERC-721 address. Validate it's a contract (`code.length > 0`) and ideally ERC-165 `supportsInterface(0x80ac58cd)`. |
| `sharesPerHolder`, `lootPerHolder` | At least one > 0. |
| `requireTribute` + `tributeAmount` | If on, amount > 0; if off, amount must be 0. |
| `expiry` | unix ts or 0. |
| `mintCap` | **required, > 0**, and `>= sharesPerHolder + lootPerHolder`. |
| `perAddressCap` | 0 or `>= sharesPerHolder + lootPerHolder`. Per-WALLET (not anti-whale). |
| `allowlistRoot` | `0x0` or a Merkle root (reuse the allowlist tooling, §4). |
| `name`, `description` | optional metadata (emitted in `NavigatorDeployed`). |

### 2.2 Validation (`src/utils/navigatorValidation.ts`)

Add an `NFTGatedNavigator` branch that mirrors the constructor's reverts (fail fast in the UI so the
deploy tx can't revert `InvalidConfig`):

```ts
// zod or manual — reject before deploy:
// - gateToken is a deployed contract (and, if checkable, ERC-721 via supportsInterface)
// - sharesPerHolder + lootPerHolder > 0
// - requireTribute === (tributeAmount > 0)            // both directions
// - mintCap > 0
// - sharesPerHolder + lootPerHolder <= mintCap
// - perAddressCap === 0 || perAddressCap >= sharesPerHolder + lootPerHolder
```

### 2.3 Deploy (`src/services/core/NavigatorDeployService.ts`)

Add an `NFTGatedNavigator` case that builds a `quais.ContractFactory(abi, bytecode, signer)` and calls
`deploy(...)` with the 12 constructor args in the order above (same shape as the Onboarder case).
Capture the deployed address.

### 2.4 Register as MANAGER

Registration is a governance action, identical to the other navigators: a `setNavigators`
proposal granting permission `2` (MANAGER) — reuse the existing navigator-registration proposal flow.
The navigator only mints after it's registered AND processed.

> The indexer auto-discovers metadata from `NavigatorDeployed` (no action needed) and the DAO
> association from `NavigatorSet`. See `daoships-indexer/docs/NFT_GATE_SUPPORT.md`.

---

## 3. Member flow — onboard with an owned NFT

### 3.1 Live config

Extend `src/hooks/useNavigatorConfig.ts` to read the immutable views when
`navigator_type === 'NFTGatedNavigator'`: `gateToken`, `sharesPerHolder`, `lootPerHolder`,
`requireTribute`, `tributeAmount`, `expiry`, `mintCap`, `perAddressCap`, `allowlistRoot`, `paused`.

### 3.2 Which tokens can the member claim?

The gate is an arbitrary ERC-721, so token discovery depends on the collection:

1. **Enumerable collections** (`supportsInterface(0x780e9d63)`): list the member's tokens via
   `balanceOf` + `tokenOfOwnerByIndex`.
2. **Non-enumerable**: let the member paste/select a `tokenId`, or source owned tokenIds from an
   external NFT index if available.

For each candidate `tokenId`, call the navigator's **preflight view** (never reverts):

`canOnboard` is now **overloaded** — use the explicit ethers v6 signature form to disambiguate:

```ts
// No-allowlist deployment → 2-arg overload.
const claimable = await navigator["canOnboard(address,uint256)"](memberAddress, tokenId)
// false if: paused | expired | already claimed | member doesn't currently own tokenId
// ⚠️ Returns FALSE whenever an allowlist is configured (allowlistRoot != 0): the 2-arg view
//    cannot verify membership without a proof, so it refuses to over-report eligibility.

// Allowlist deployment → 3-arg overload that DOES evaluate the Merkle allowlist for the member.
const claimableAL = await navigator["canOnboard(address,uint256,bytes32[])"](memberAddress, tokenId, proof)

const alreadyClaimed = await navigator.claimed(tokenId) // show "membership already claimed for this NFT"
```

> `canOnboard` does NOT check tribute or mint caps. **For an allowlist-gated deployment the 2-arg
> overload always returns false** — gate the UI on the 3-arg `canOnboard(member, tokenId, proof)`
> overload (same Merkle proof you pass to `onboard(tokenId, proof)`). Also surface `mintCap`/`totalMinted`
> (cap reached → claim will revert `MintCapExceeded`) and, in tribute mode, the required `tributeAmount`.

### 3.3 Submit the claim

```ts
// free-mint
await navigator.onboard(tokenId)                              // no value
// tribute-required
await navigator.onboard(tokenId, { value: tributeAmount })
// with allowlist active (see §4)
await navigator.onboard(tokenId, proof, { value: requireTribute ? tributeAmount : 0n })
```

Use the existing wagmi/quais write + `useTransactionFlow` patterns. Handle the custom errors with
clear copy:

| Error | UI message |
|---|---|
| `NotHolder` | "You don't own this NFT (or it doesn't exist)." |
| `AlreadyClaimed` | "Membership has already been claimed for this NFT." |
| `IncorrectTribute` | "Send exactly {tributeAmount} QUAI." |
| `NoTributeRequired` | "This is a free claim — don't send QUAI." |
| `MintCapExceeded` | "This navigator's membership cap is reached." |
| `PerAddressCapExceeded` | "You've reached the per-wallet claim limit." |
| `NotAllowlisted` | "Your wallet isn't on the allowlist." |
| `IsPaused` / `Expired` | "Onboarding is paused / has ended." |

### 3.4 Post-claim UX

Shares are a **ticket**: after a successful claim, `claimed[tokenId]` is permanently true. If the
member later sells the NFT, they keep their shares and the buyer **cannot** claim with that token —
render `claimed[tokenId]` prominently on any NFT-claim card to avoid confusion on secondary markets.

---

## 4. Optional allowlist (composes on top of the gate)

If `allowlistRoot !== 0x0`, the member must own an unclaimed token **and** be on the allowlist. Reuse
`src/hooks/useNavigatorAllowlist.ts` + `@openzeppelin/merkle-tree` exactly as for the other navigators
(leaf is the member address; pass the proof to `onboard(tokenId, proof)`). When a root is set, the
no-proof overload `onboard(tokenId)` reverts `NotAllowlisted`.

---

## 5. Reading claims from the indexer

The indexer shipped **Option B**: every claim writes **both** of the following in the same tx (they're
complementary, not duplicates) — see `daoships-indexer/docs/FRONTEND_INTEGRATION.md` (`NftClaimRow`,
`isNftClaimed`/`listNftClaims`):

- **`ds_nft_claims`** — the **dedicated per-token claim ledger**. One row per `tokenId` ever claimed; the
  authoritative O(1) source for "is token #N claimed?" and claim provenance. Mirror `NftClaimRow` into
  `src/types/navigator.ts` and add `NavigatorIndexerService` reads:
  - `isNftClaimed(navAddr, tokenId)` → row by id `{navigator}-{tokenId}` (null = unclaimed) — cheaper than
    an on-chain `navigator.claimed(tokenId)` call.
  - `listNftClaims(navAddr)` → paginated claim history, `block_number desc`.
  - Realtime: `ds_nft_claims` **is** in the realtime publication — subscribe (filter `dao_id`) for live claims.
- **`ds_navigator_events`** with `event_type='onboard'` — the generic onboarding *activity* feed (already
  works), used alongside member balances.

> **There is no `event_type='nft_claim'`.** An earlier draft proposed putting `token_id` in
> `NavigatorEvent.metadata`; the indexer instead added the dedicated `ds_nft_claims` table. Read `token_id`
> (and `holder`/`shares`/`loot`) from `ds_nft_claims`, not from `metadata`.

> `holder` on a claim row is the **claimer at claim time**. The NFT can be sold afterward — shares stay with
> the original claimer and the token stays claimed — so render `holder` + claimed status, never infer current
> ownership from this table.

---

## 6. Checklist

- [ ] Fix `navigatorCatalog.ts` entry → `shipped`, ERC-721-only features, claim-ticket warning.
- [ ] Add `NFTGatedNavigator.json` + `.bytecode.ts` to `src/config/abi/`; add an ERC-721 ABI.
- [ ] Config form + `navigatorValidation.ts` branch mirroring the constructor guards.
- [ ] `NavigatorDeployService` case (12 args, correct order).
- [ ] `useNavigatorConfig` reads for the NFT-gate fields.
- [ ] Member onboarding UI: token discovery, `canOnboard`/`claimed` preflight (use the **3-arg `canOnboard(member, tokenId, proof)`** overload for allowlist deployments — the 2-arg one returns false when an allowlist is set), `onboard(tokenId[, proof])`, custom-error copy, post-claim `claimed` display.
- [ ] Allowlist path via existing merkle tooling.
- [ ] Render per-token claim status + history from the dedicated **`ds_nft_claims`** table (`isNftClaimed`/`listNftClaims`); use `ds_navigator_events` (`event_type='onboard'`) for the generic activity feed.

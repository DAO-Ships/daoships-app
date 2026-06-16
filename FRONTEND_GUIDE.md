# DAO Ships Frontend -- Development Guide

> **Last updated:** 2026-06-11
> **Covers:** daoships-indexer audit fixes, daoships-contracts hardening (INavigator, EIP-2612, status flags),
> the navigator **trust + lifecycle** refactor (`trust_status`, `permission_ever_granted`, redefined
> `is_active`), and five new navigators (NFTGated, Signal, Timelock, Vesting, **Budget**). Budget adds a
> **third trust class** — see [Navigator System](#8-navigator-system) and the trust table below.
>
> **Per-navigator deep-dives live in `docs/`:** [`NFT_GATE_SUPPORT.md`](docs/NFT_GATE_SUPPORT.md),
> [`SIGNAL_NAVIGATOR_SUPPORT.md`](docs/SIGNAL_NAVIGATOR_SUPPORT.md),
> [`TIMELOCK_NAVIGATOR_SUPPORT.md`](docs/TIMELOCK_NAVIGATOR_SUPPORT.md),
> [`VESTING_NAVIGATOR_SUPPORT.md`](docs/VESTING_NAVIGATOR_SUPPORT.md),
> [`BUDGET_NAVIGATOR_SUPPORT.md`](docs/BUDGET_NAVIGATOR_SUPPORT.md),
> [`TRUST_ARCHITECTURE_REFACTOR_PLAN.md`](docs/TRUST_ARCHITECTURE_REFACTOR_PLAN.md). Indexer row-shape
> contract: `daoships-indexer/docs/FRONTEND_INTEGRATION.md`.

This guide covers how the `daoships-app` frontend connects to the `daoships-indexer` Supabase backend, contract interfaces, and the patterns to follow.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Contract Addresses & ABIs](#2-contract-addresses--abis)
3. [Database Schema Reference](#3-database-schema-reference)
4. [Supabase Query Patterns](#4-supabase-query-patterns)
5. [Realtime Subscriptions](#5-realtime-subscriptions)
6. [Trust Model & Poster Integration](#6-trust-model--poster-integration)
7. [Proposal Lifecycle & Status](#7-proposal-lifecycle--status)
8. [Navigator System](#8-navigator-system)
9. [Token Operations & Member Tracking](#9-token-operations--member-tracking)
10. [Service Architecture](#10-service-architecture)
11. [Component Architecture](#11-component-architecture)
12. [Route Structure](#12-route-structure)
13. [Security Practices](#13-security-practices)
14. [Testing](#14-testing)
15. [Environment Configuration](#15-environment-configuration)
16. [Address Handling](#16-address-handling)
17. [Breaking Changes & Migration Notes](#17-breaking-changes--migration-notes)

---

## 1. Architecture Overview

```
+--------------+     +------------------+     +---------------+
|  Quai Chain  |---->| daoships-indexer  |---->|   Supabase    |
|  (Cyprus1)   |     | (event listener)  |     |  (PostgreSQL) |
+------+-------+     +------------------+     +-------+-------+
       |                                              |
       |  on-chain reads/writes                       |  indexed reads
       |  (quais.js via Pelagus)                      |  (supabase-js)
       v                                              v
+-------------------------------------------------------------+
|                    daoships-app (React)                      |
|                                                             |
|  +--------------+  +----------------+  +-----------------+  |
|  |  core/       |  |  indexer/      |  |  hooks/         |  |
|  |  DAOShipSvc  |  |  DaoIndexer   |  |  useProposals   |  |
|  |  LauncherSvc |  |  ProposalIdx  |  |  useMembers     |  |
|  |  PosterSvc   |  |  MemberIdx    |  |  useVoting      |  |
|  |  NavigatorSvc|  |  VoteIdx      |  |  useLaunch      |  |
|  |  TokenSvc    |  |  NavigatorIdx |  |  useDelegation  |  |
|  +--------------+  +----------------+  +-----------------+  |
|                          |                                  |
|                   DaoService (facade)                       |
+-------------------------------------------------------------+
```

**Data flow:**
- **Reads**: Hook -> DaoService -> IndexerService (Supabase) -> fallback to on-chain RPC
- **Writes**: Hook -> DaoService -> Core Service -> Contract interaction (via Pelagus wallet)
- **Metadata**: PosterService -> Poster.sol -> indexed into `ds_records` by the indexer

**Key dependencies:**
- `quais` -- Quai Network's ethers.js fork
- `@supabase/supabase-js` -- Direct Supabase client (PostgREST, not GraphQL)
- `@tanstack/react-query` -- Server state management with caching
- `zustand` -- Client state (wallet, UI, current DAO)
- `react-hook-form` + `zod` -- Form validation
- `dompurify` -- HTML sanitization for user-generated content

---

## 2. Contract Addresses & ABIs

### Quai Orchard Testnet (Chain 15000)

| Contract | Address |
|----------|---------|
| **Poster** | `0x0010CDE67Dc36f98557Fc686f800F908b755407C` |
| **DAOShip Singleton** | `0x00298e9aA7fc36D80D6d7a859154246a0000861A` |
| **SharesERC20 Singleton** | `0x001a08868a56AFc4679c8020e80cE105b4B7CeA8` |
| **LootERC20 Singleton** | `0x004096BF49A948A2D66FD47be1b22ABBef251AF7` |
| **DAOShipLauncher** | `0x00681160732b3141Ddb116F8B946aCf5fB4365fa` |
| **DAOShipAndVaultLauncher** | `0x0056386fCE771Da46336DE77E8F046c30aBAF732` |
| **OnboarderNavigator** | `0x0031C843A919dFc022DeA5A809B693009A29464b` |
| **Quai Vault Factory** | `0x002d1305D597c157bB975967FA2e5337674b0E5F` |
| **MultiSendCallOnly** | `0x002ae8A47C2da497fe569AfCF0486410aA1093E0` |

### Key ABI Changes

**INavigator (NEW -- all navigators must implement):**
```solidity
interface INavigator {
    event NavigatorDeployed(
        address indexed daoShip,
        address indexed deployer,
        string navigatorType,
        string name,
        string description
    );
    function deployer() external view returns (address);
    function navigatorType() external view returns (string memory);
}
```

**EIP-2612 Permit (NEW on both token contracts):**
```solidity
function permit(
    address owner, address spender, uint256 value,
    uint256 deadline, uint8 v, bytes32 r, bytes32 s
) external
function nonces(address owner) external view returns (uint256)
function DOMAIN_SEPARATOR() external view returns (bytes32)
```

**Proposal status flags (CHANGED):**
- Storage changed from `bool[4] status` to packed `uint8 statusFlags`
- Bit flags: CANCELLED=1, PROCESSED=2, PASSED=4, ACTION_FAILED=8
- ABI-compatible: use `getProposalStatus()` helper which returns the same enum

---

## 3. Database Schema Reference

All tables use the `ds_` prefix and live in the network-specific schema (`dev`, `testnet`, or `mainnet`). All data is publicly readable via RLS policies.

### ds_daos

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR(42) | DAOShip contract address (PK) |
| `created_at` | TIMESTAMPTZ | |
| `tx_hash` | VARCHAR(66) | |
| `loot_address` | VARCHAR(42) | |
| `shares_address` | VARCHAR(42) | |
| `avatar` | VARCHAR(42) | Vault/treasury address |
| `deployer` | VARCHAR(42) | Deployer wallet |
| `launcher_contract` | VARCHAR(42) | Factory that deployed |
| `loot_paused` | BOOLEAN | |
| `shares_paused` | BOOLEAN | |
| `grace_period` | BIGINT | Seconds |
| `voting_period` | BIGINT | Seconds |
| `voting_plus_grace_duration` | BIGINT | **Generated column** (voting_period + grace_period) |
| `proposal_offering` | NUMERIC(78,0) | Wei (anti-spam deposit) |
| `quorum_percent` | NUMERIC(78,0) | Basis points (2000 = 20%) |
| `sponsor_threshold` | NUMERIC(78,0) | Min shares to auto-sponsor |
| `min_retention_percent` | NUMERIC(78,0) | Basis points |
| `default_expiry_window` | BIGINT | Auto-expiry for Ready proposals (0 = 2x voting+grace) |
| `share_token_name` | VARCHAR(255) | |
| `share_token_symbol` | VARCHAR(32) | |
| `loot_token_name` | VARCHAR(255) | |
| `loot_token_symbol` | VARCHAR(32) | |
| `total_shares` | NUMERIC(78,0) | **Updated atomically** via `ds_adjust_dao_totals` |
| `total_loot` | NUMERIC(78,0) | **Updated atomically** via `ds_adjust_dao_totals` |
| `latest_sponsored_proposal_id` | BIGINT | |
| `proposal_count` | BIGINT | Derived from ds_proposals count |
| `active_member_count` | BIGINT | Derived from ds_members WHERE shares > 0 OR loot > 0 |
| `new_vault` | BOOLEAN | |
| `admin_locked` | BOOLEAN | |
| `manager_locked` | BOOLEAN | |
| `governor_locked` | BOOLEAN | |
| `name` | VARCHAR(255) | From Poster (sanitized in content_json) |
| `description` | TEXT | From Poster (sanitized in content_json) |
| `avatar_img` | TEXT | From Poster (validated URL) |
| `profile_source` | VARCHAR(20) | `'vault'` or `'launcher'` -- determines update precedence |

### ds_members

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR(85) | `{dao_id}-{member_address}` |
| `dao_id` | VARCHAR(42) | FK to ds_daos |
| `member_address` | VARCHAR(42) | |
| `shares` | NUMERIC(78,0) | From Transfer events (canonical source) |
| `loot` | NUMERIC(78,0) | From Transfer events (canonical source) |
| `delegating_to` | VARCHAR(42) | null = self-delegating |
| `voting_power` | NUMERIC(78,0) | From DelegateVotesChanged |
| `votes` | BIGINT | Count of votes cast (derived from ds_votes) |
| `last_activity_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### ds_proposals

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR(90) | `{dao_id}-{proposal_id}` |
| `dao_id` | VARCHAR(42) | FK to ds_daos |
| `proposal_id` | BIGINT | On-chain numeric ID |
| `submitter` | VARCHAR(42) | |
| `sponsored` | BOOLEAN | |
| `sponsor` | VARCHAR(42) | |
| `self_sponsored` | BOOLEAN | |
| `voting_period` | BIGINT | Governance config at submission time |
| `voting_starts` | TIMESTAMPTZ | Set at sponsor time |
| `voting_ends` | TIMESTAMPTZ | |
| `grace_ends` | TIMESTAMPTZ | |
| `expiration` | TIMESTAMPTZ | Optional (can be null) |
| `cancelled` | BOOLEAN | |
| `cancelled_by` | VARCHAR(42) | |
| `processed` | BOOLEAN | |
| `processed_by` | VARCHAR(42) | |
| `passed` | BOOLEAN | |
| `action_failed` | BOOLEAN | |
| `yes_votes` | BIGINT | Count of yes voters |
| `no_votes` | BIGINT | Count of no voters |
| `yes_balance` | NUMERIC(78,0) | Sum of yes voter balances |
| `no_balance` | NUMERIC(78,0) | Sum of no voter balances |
| `max_total_shares_and_loot_at_vote` | NUMERIC(78,0) | Snapshot at sponsor |
| `max_total_shares_at_sponsor` | NUMERIC(78,0) | Snapshot at sponsor |
| `proposal_offering` | NUMERIC(78,0) | |
| `proposal_data_hash` | VARCHAR(66) | |
| `proposal_data` | TEXT | Encoded action bytes |
| `details` | TEXT | Up to 64KB, user-supplied |
| `block_number` | BIGINT | |

### ds_votes

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR(132) | `{dao_id}-{proposal_id}-{voter}` |
| `dao_id` | VARCHAR(42) | |
| `proposal_id` | VARCHAR(90) | FK to ds_proposals |
| `voter` | VARCHAR(42) | |
| `approved` | BOOLEAN | |
| `balance` | NUMERIC(78,0) | Voting weight at time of vote |
| `block_number` | BIGINT | |

### ds_navigators

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR(85) | `{dao_id}-{navigator_address}` |
| `dao_id` | VARCHAR(42) | **Now bound for EVERY navigator at `NavigatorDeployed`** (no more dao-less orphans). For read-only navigators this binding is *self-asserted* — gate on `trust_status`. No longer an FK. |
| `navigator_address` | VARCHAR(42) | |
| `deployer` | VARCHAR(42) | From NavigatorDeployed event |
| `permission` | INTEGER | 0-7 bitmask |
| `permission_label` | ENUM | none/admin/manager/admin_manager/governor/admin_governor/manager_governor/all |
| `permission_ever_granted` | BOOLEAN | **NEW.** TRUE once a `NavigatorSet(>0)` was seen. Distinguishes a *revoked* nav (`true`, now perm 0) from a *born read-only* one (`false`). Monotonic. |
| `trust_status` | VARCHAR(16) | **NEW.** `self_asserted` \| `sanctioned` \| `unsanctioned` \| `fabricated`. **Three classes:** permissioned navs are always `sanctioned` (vouched by `NavigatorSet`); **read-only** (Signal) start `self_asserted` → `sanctioned` via a vault `daoships.dao.navigators` post; **module** (Budget) start `self_asserted` → `sanctioned` via a vault `EnabledModule` event (derived from `ds_vault_module_events`). **Gate read-only AND module navigator UIs on this.** |
| `is_active` | BOOLEAN | **REDEFINED: "functional now?", NOT "has permission".** Read-only navs stay `true` at `permission = 0`; **module (Budget) navs are `false` until the vault enables them**, then `true`; otherwise `false` = revoked / paused-by-gov / permissioned-but-not-yet-registered. No longer a proxy for permission. |
| `paused` | BOOLEAN | |
| `navigator_type` | VARCHAR(50) | **Sanitized** (control chars stripped) |
| `name` | VARCHAR(255) | **Sanitized** |
| `description` | TEXT | **Sanitized** |
| `deploy_block` | BIGINT | **NEW.** Block of `NavigatorDeployed` (bounds the sanction backfill range). |
| `config` | JSONB | |
| `tx_hash` | VARCHAR(66) | |

### ds_records

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR(130) | |
| `dao_id` | VARCHAR(42) | Nullable (orphaned allowlist records) |
| `user_address` | VARCHAR(42) | |
| `tag` | VARCHAR(100) | |
| `content` | TEXT | **RAW ON-CHAIN DATA -- UNTRUSTED. Always escape before rendering.** |
| `content_json` | JSONB | **Sanitized and validated by indexer. Prefer this for display.** |
| `trust_level` | VARCHAR(20) | VERIFIED / VERIFIED_INITIAL / SEMI_TRUSTED / ON_CHAIN_PROVISIONAL / MEMBER |
| `block_number` | BIGINT | |

### Other Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `ds_navigator_events` | dao_id, navigator_address, event_type (`'onboard'`), contributor, shares_minted, loot_minted, amount | Onboard activity feed (all navigators) |
| `ds_nft_claims` | id (`{nav}-{tokenId}`), dao_id, navigator_address, token_id, holder, shares, loot | **NFTGated** per-token claim ledger (claimed-once-forever). `holder` = claimer at claim time |
| `ds_signal_polls` | id (`{nav}-{pollId}`), dao_id, navigator_address, poll_id, creator, question, option_count, voting_starts, voting_ends, cancelled, tally[] | **Signal** polls. Materialized **only** for `sanctioned` navs. Status time-derived |
| `ds_signal_votes` | id (`{nav}-{pollId}-{voter}`), poll_pk, dao_id, navigator_address, poll_id, voter, option, weight | **Signal** votes. `weight` = SHARE power at snapshot (loot excluded) |
| `ds_timelock_changes` | id (`{nav}-{changeId}`), dao_id, navigator_address, change_id, queued_by, config_hash, governance_config, executable_after, expires_at, status, executed_tx, cancelled_tx | **Timelock** change lifecycle. `governance_config` = full bytes needed by `executeChange`. `executable`/`expired` time-derived |
| `ds_governance_config_history` | id (`{tx}-{logIndex}`), dao_id, (config fields), bypassed_timelock | Every `GovernanceConfigSet` + the **timelock-bypass** flag (warn the UI) |
| `ds_vesting_schedules` | id (`{nav}-{scheduleId}`), dao_id, navigator_address, schedule_id, beneficiary, total_amount, claimed, is_loot, start_time, cliff_end, vesting_end, revoked, revoked_at | **Vesting** schedules. `claimed` derive-from-truth. Status/claimable time-derived |
| `ds_vesting_claims` | id (`{tx}-{logIndex}`), schedule_pk, dao_id, navigator_address, schedule_id, beneficiary, amount, is_loot | **Vesting** incremental-claim feed. Append-only. `amount` = this claim only |
| `ds_budgets` | id (`{nav}-{budgetId}`), dao_id, navigator_address, budget_id, manager, token (`0x0`=native QUAI), allowance_per_period, total_ceiling, total_spent, period_length, starts_at, ends_at, cancelled | **Budget** recurring treasury budgets. Materialized **only** for `sanctioned` (vault-enabled) navs. `total_spent` derive-from-truth; live `remaining` via contract views |
| `ds_budget_disbursements` | id (`{nav}-{budgetId}-{tx}-{logIndex}`), budget_pk, dao_id, navigator_address, budget_id, recipient, token, amount | **Budget** payout feed. One row per recipient (`disburseBatch` emits N). Don't sum for balances — take from token transfers |
| `ds_vault_module_events` | id (`{tx}-{logIndex}`), dao_id, vault, navigator_address, enabled, log_index, block_number | **Budget** trust feed — vault `EnabledModule`/`DisabledModule`. The indexer derives a budget nav's `trust_status`/`is_active` from the **latest** row. Read it for the "treasury access granted/revoked" timeline |
| `ds_navigator_sanction_intents` | dao_id, navigator_address, vault | Internal hold for a sanction post / module-enable seen before the navigator's deploy (NOT for app reads) |
| `ds_ragequits` | dao_id, member_address, shares_burned, loot_burned, tokens[], amounts[] | Exit records |
| `ds_guild_tokens` | dao_id, token_address, enabled | Max 20 tokens per DAO |
| `ds_delegations` | dao_id, delegator, from_delegate, to_delegate | Append-only history |
| `ds_event_transactions` | id (tx_hash), dao_id, block_number | All indexed transactions |
| `ds_indexer_state` | last_block_number, last_block_hash, is_syncing | **Publicly readable** -- use for sync status UI |
| `ds_processed_logs` | tx_hash, log_index, block_number | Internal dedup (NOT publicly readable) |

> Full row-shape TypeScript interfaces for every navigator table (NftClaimRow, SignalPollRow,
> TimelockChangeRow, GovernanceConfigHistoryRow, VestingScheduleRow, VestingClaimRow) + ready-made query
> helpers live in `daoships-indexer/docs/FRONTEND_INTEGRATION.md`. Mirror them rather than re-deriving.

---

## 4. Supabase Query Patterns

All indexer services are in `src/services/indexer/`. They use the nullable `supabase` client from `src/config/supabase.ts`.

```typescript
// Get a DAO by ID
const { data } = await supabase
  .from('ds_daos')
  .select('*')
  .eq('id', daoId.toLowerCase())
  .single()

// List proposals with pagination
const { data } = await supabase
  .from('ds_proposals')
  .select('*')
  .eq('dao_id', daoId.toLowerCase())
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1)

// Active members only
const { data } = await supabase
  .from('ds_members')
  .select('*')
  .eq('dao_id', daoId.toLowerCase())
  .or('shares.gt.0,loot.gt.0')

// Check indexer sync status
const { data } = await supabase
  .from('ds_indexer_state')
  .select('last_block_number, is_syncing')
  .eq('id', 1)
  .single()
```

**Important patterns:**
- Always lowercase addresses before querying: `.eq('id', daoId.toLowerCase())`
- Use `select('*')` for full rows or `select('id, name, shares')` for partial
- Indexer services return `null` when `supabase` client is null (direct-RPC mode)
- The `DaoService` facade handles the indexer -> RPC fallback automatically
- All balances are strings -- parse with `BigInt()` or `safeBigInt()`, never `Number()`

---

## 5. Realtime Subscriptions

### Enabled Tables (REPLICA IDENTITY FULL)

ds_daos, ds_proposals, ds_members, ds_votes, ds_records, ds_navigators, ds_navigator_events,
ds_nft_claims, ds_signal_polls, ds_signal_votes, ds_timelock_changes, ds_governance_config_history,
ds_vesting_schedules, ds_budgets, ds_budget_disbursements, ds_vault_module_events, ds_indexer_state

> On a `ds_navigators` UPDATE, watch `trust_status` — a `self_asserted → sanctioned` flip is when a
> Signal navigator's polls (or a Budget navigator's budgets) appear (the indexer backfills on
> sanction/enable). On a `ds_signal_votes` INSERT, re-read the poll for the recomputed `tally`. On a
> `ds_vesting_schedules` UPDATE, `claimed` changed; on a `ds_budgets` UPDATE, `total_spent` changed. A
> `ds_vault_module_events` INSERT is a treasury-module enable/disable — re-read the budget nav's trust.

### NOT Subscribed (internal/high-volume)

ds_event_transactions, ds_delegations, ds_ragequits, ds_guild_tokens, **ds_vesting_claims**
(append-only — subscribe to `ds_vesting_schedules` instead), ds_navigator_sanction_intents (internal)

### Pattern

```typescript
supabase
  .channel(`proposal-${proposalId}`)
  .on('postgres_changes', {
    event: '*',
    schema: INDEXER_CONFIG.NETWORK_SCHEMA,
    table: 'ds_proposals',
    filter: `id=eq.${proposalId}`,
  }, () => {
    queryClient.invalidateQueries({ queryKey: ['proposal', daoId, proposalId] })
  })
  .subscribe()
```

### Sync Status Monitoring

Subscribe to `ds_indexer_state` to show "syncing..." or "data may be stale" warnings:

```typescript
supabase
  .channel('indexer-state')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: INDEXER_CONFIG.NETWORK_SCHEMA,
    table: 'ds_indexer_state',
    filter: 'id=eq.1',
  }, (payload) => {
    const { is_syncing, last_block_number } = payload.new
    // Update UI sync indicator
  })
  .subscribe()
```

---

## 6. Trust Model & Poster Integration

### Trust Hierarchy

```
UNTRUSTED (0) < MEMBER (1) < ON_CHAIN_PROVISIONAL (2) < SEMI_TRUSTED (3) < VERIFIED_INITIAL (4) < VERIFIED (5)
```

**How trust is determined:**
1. User = DAO avatar (vault) -> **VERIFIED**
2. User = DAO deployer posting `daoships.dao.profile.initial` -> **VERIFIED_INITIAL**
3. User = DAO contract itself -> **VERIFIED**
4. User = registered navigator address -> **SEMI_TRUSTED**
5. User = member with shares > 0 -> **MEMBER**
6. On-chain verification for pre-DAO allowlists -> **ON_CHAIN_PROVISIONAL**
7. Default -> **UNTRUSTED** (rejected, not stored)

### Recognized Tags (7 tags -- indexer only processes these)

| Tag | Min Trust | Updates DAO Profile | Content Schema |
|-----|-----------|---------------------|----------------|
| `daoships.dao.profile.initial` | VERIFIED_INITIAL | Yes (launcher) | name\*, description\*, avatar, links, tags |
| `daoships.dao.profile` | VERIFIED | Yes (vault) | name\*, description\*, avatar, links, tags |
| `daoships.dao.announcement` | VERIFIED | No | title\*, body, severity, url, expiresAt |
| `daoships.dao.navigators` | VERIFIED | No | daoAddress\*, navigators\*: [{ address\*, type }] — **full** sanctioned set (last-write-wins; omitted = de-sanctioned; `[]` = clear all) |
| `daoships.member.profile` | MEMBER | No | name\*, bio, avatar, daoAddress |
| `daoships.proposal.vote.reason` | MEMBER | No | daoAddress\*, reason\*, proposalId, vote |
| `daoships.navigator.allowlist` | MEMBER | No | daoAddress\*, navigatorAddress\*, root\*, addresses[] or ipfsCid |

\* = required field

> **`daoships.dao.navigators` is the navigator-sanction tag.** A vault post (via governance proposal)
> endorses read-only navigators (Signal) so their feeds surface and their polls materialize. It grants
> **no on-chain permission** — it only sets `ds_navigators.trust_status = 'sanctioned'`. See
> [`docs/SIGNAL_NAVIGATOR_SUPPORT.md`](docs/SIGNAL_NAVIGATOR_SUPPORT.md) §3.

### Content Validation Rules

- **Max content size**: 16KB hard limit
- **JSON required**: All poster content must be valid JSON with `schemaVersion` field
- **Control chars stripped**: Null bytes and C0/C1 control characters removed from all string fields
- **URL validation**: Must start with `http://`, `https://`, or `ipfs://`
- **Array cap**: Max 1000 items in any JSONB array
- **Object depth**: Max 5 levels of nesting
- **Prototype pollution blocked**: `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty` keys rejected
- **Address validation**: Must match `0x` + 40 hex chars, normalized to lowercase

### Profile Update Semantics

For `daoships.dao.profile` and `daoships.dao.profile.initial`:
- Field present with value -> **set** the field
- Field present with `null` -> **clear** the field
- Field absent -> **no change** (preserve existing)
- `profile_source` tracks precedence: `'vault'` updates always apply; `'launcher'` updates only apply if no vault update has occurred

### Content Storage

| Column | Safety | Use For |
|--------|--------|---------|
| `content` | **UNTRUSTED** raw on-chain string | Audit trail only. **Never render without escaping.** |
| `content_json` | **Sanitized** by indexer | Display to users. Fields validated per tag schema. |

---

## 7. Proposal Lifecycle & Status

### Status States

```
Unborn -> Submitted -> Voting -> Grace -> Ready -> Processed
                                            \-> Defeated
                                            \-> Expired
          \-> Cancelled (at any point before processing)
```

### Status Derivation (client-side or via `ds_get_proposal_status` RPC)

```typescript
function getProposalStatus(p: Proposal): string {
  if (p.cancelled) return 'cancelled'
  if (p.processed) return p.passed ? 'processed' : 'defeated'
  if (!p.sponsored) return 'submitted'
  if (p.expiration && new Date() > new Date(p.expiration)) return 'expired'
  if (new Date() < new Date(p.voting_ends)) return 'voting'
  if (new Date() < new Date(p.grace_ends)) return 'grace'
  return 'ready'
}
```

### Key Behaviors

- **Parallel execution**: Any Ready proposal can be processed in any order (no sequential queue)
- **Unsponsored expiry**: Unsponsored proposals can now expire (new behavior)
- **Defeated processing**: Defeated proposals must be closed with empty data (prevents queue blocking)
- **Flash-loan protection**: Sponsorship snapshot uses `getPriorVotes(timestamp - 1)`
- **Vote tallies**: Idempotently derived from `ds_votes` table (not incremented)
- **Vote weight**: Uses timestamp-based checkpoints (`getPriorVotes(voter, votingStarts)`)

---

## 8. Navigator System

### Permission Bitmask (3 bits, values 0-7)

| Bit | Value | Role | Can Do |
|-----|-------|------|--------|
| 0 | 1 | ADMIN | Pause/unpause token transfers |
| 1 | 2 | MANAGER | Mint/burn shares and loot, convertSharesToLoot |
| 2 | 4 | GOVERNOR | Set governance config, cancel proposals |

Combined: 3=ADMIN+MANAGER, 5=ADMIN+GOVERNOR, 6=MANAGER+GOVERNOR, 7=ALL

```typescript
// Check specific permission bits
const isAdmin = (permission & 1) !== 0
const isManager = (permission & 2) !== 0
const isGovernor = (permission & 4) !== 0
```

### Navigator Metadata

All navigators implement `INavigator` and emit `NavigatorDeployed` in their constructor with:
- `deployer` (indexed) -- who deployed the navigator
- `navigatorType` -- compile-time constant string (e.g., "OnboarderNavigator", "ERC20TributeNavigator")
- `name`, `description` -- human-readable, **sanitized by indexer** (control chars stripped)

Metadata is immutable (emitted once at deployment) and cached by the indexer.

### Navigator Trust & Lifecycle (READ THIS — it changed how navigators work)

The introduction of a **read-only** navigator (Signal) and then a **module** navigator (Budget) — both
hold no DAOShip permission and never fire `NavigatorSet` — forced a trust + lifecycle model. There are
now **three trust classes**:

| Class | Types | Sanction signal → `sanctioned` | Born | `is_active` |
|---|---|---|---|---|
| Permissioned | Onboarder, ERC20Tribute, NFTGated, Timelock, Vesting | `NavigatorSet` permission bit | `sanctioned` | `true` once permission > 0 |
| Read-only | Signal | vault `daoships.dao.navigators` Poster post | `self_asserted` | `true` at perm 0 (functional) |
| **Module** | **Budget** | vault **`EnabledModule`** event | `self_asserted` | **`false` until enabled**, then `true` |

Two semantics changed for **every** navigator type:

1. **`is_active` = "functional now?", not "has permission."** A read-only navigator is functional at
   `permission = 0` (`is_active = true`); a **module** navigator is the opposite (`is_active = false`
   until the vault enables it). Any code reading `is_active` as "has permission" is now wrong — use
   `permission > 0` (or `permission_ever_granted` for "was it ever granted").
2. **`dao_id` is bound at deploy for every navigator, but for read-only AND module navs it's
   *self-asserted*.** Anyone can deploy a contract claiming any DAO, so `trust_status` is the only guard.
   Default read-only/module feeds to `trust_status = 'sanctioned'`; show `self_asserted` behind a
   toggle/badge; hide `unsanctioned`/`fabricated`. Permissioned navs are always `sanctioned`.

| `trust_status` | Meaning | Default UI |
|---|---|---|
| `sanctioned` | Permissioned, OR read-only endorsed via `daoships.dao.navigators`, OR module enabled via `vault.enableModule` | **Show** |
| `self_asserted` | Read-only/module, deployed but not (yet) endorsed/enabled | Behind "show unverified" toggle / badge |
| `unsanctioned` | Endorsement revoked (Signal de-listed, or Budget module disabled) | Hide |
| `fabricated` | (Signal only) failed weight reconciliation | **Never show** |

### Navigator Types Shipped

**OnboarderNavigator** (MANAGER) -- Native QUAI tribute
- Pricing: multiplier mode or fixed-price mode
- Features: Merkle allowlist, per-address cap, total mint cap, expiry, pause/unpause

**ERC20TributeNavigator** (MANAGER) -- ERC20 tribute
- Per-token pricing (`pricePerShare`, `pricePerLoot`)
- EIP-2612 permit support via `onboardWithPermit()`
- Same safety features as OnboarderNavigator

**NFTGatedNavigator** (MANAGER) -- ERC-721 ownership gate → claim shares/loot
- One claim per `tokenId`, forever (claim ticket; shares persist after the NFT is sold)
- Free-mint or native tribute; mandatory mint cap, per-wallet cap, expiry, allowlist, pause
- Indexer: per-token ledger in `ds_nft_claims`. → [`docs/NFT_GATE_SUPPORT.md`](docs/NFT_GATE_SUPPORT.md)

**SignalNavigator** (read-only, permission 0) -- Non-binding, share-weighted polls
- Holds no permission, **never registered via `setNavigators`** → needs a DAO **sanction** to surface
- **POST-LAUNCH-ONLY — exclude from the launch wizard.** The indexer's resolution gate *silently drops* a
  read-only navigator deployed before its DAO is indexed (no row, no retry). Add it only from
  navigator-management, against a live DAO. Permissioned navigators are exempt (fine at launch).
- Weight = SHARE power at poll-start snapshot (loot excluded); status time-derived
- Indexer: `ds_signal_polls` / `ds_signal_votes` (materialized only when `sanctioned`).
  → [`docs/SIGNAL_NAVIGATOR_SUPPORT.md`](docs/SIGNAL_NAVIGATOR_SUPPORT.md)

**TimelockNavigator** (GOVERNOR) -- Delays `setGovernanceConfig` behind a mandatory window
- A second ragequit window for config changes. **Advisory, not enforced** — a proposal can bypass it
- App must route config changes through `queueChange` and **warn on bypasses** (`bypassed_timelock`)
- Indexer: `ds_timelock_changes` + `ds_governance_config_history`.
  → [`docs/TIMELOCK_NAVIGATOR_SUPPORT.md`](docs/TIMELOCK_NAVIGATOR_SUPPORT.md)

**VestingNavigator** (MANAGER) -- Vests shares or loot on a cliff + linear schedule
- No escrow: unvested tokens don't exist (no power until `claim`); cliff = lump unlock of accrued-since-start
- Revoke freezes future accrual but does NOT claw back minted tokens; no global dilution cap
- Indexer: `ds_vesting_schedules` + `ds_vesting_claims`.
  → [`docs/VESTING_NAVIGATOR_SUPPORT.md`](docs/VESTING_NAVIGATOR_SUPPORT.md)

**BudgetNavigator** (**module** — permission 0, NOT read-only) -- Recurring treasury disbursement
- Authority is a **vault Zodiac module**, NOT a `setNavigators` permission. Wire-up is
  `vault.enableModule(budgetNav)` (proposal), NOT `setNavigators`. Trust = enabled-module status.
- Governance approves a budget (manager, token, per-period allowance, lifetime ceiling); the **manager**
  then `disburse`/`disburseBatch` from the vault with **no proposal per payment**, bounded by the caps.
- Treasury-disbursement only — never mints (that's Vesting). `pause` freezes ALL disbursement (fast brake);
  `cancelBudget` is surgical; `vault.disableModule` is nuclear.
- **POST-ENABLE-ONLY display:** a deployed-but-not-enabled budget nav is powerless — gate on
  `trust_status='sanctioned'` / `is_active`. Live `remaining` from contract views, not stored `total_spent`.
- Indexer: `ds_budgets` + `ds_budget_disbursements`; trust feed `ds_vault_module_events`.
  → [`docs/BUDGET_NAVIGATOR_SUPPORT.md`](docs/BUDGET_NAVIGATOR_SUPPORT.md)

**SubscriptionNavigator** (MANAGER) -- Recurring membership dues (the **9th and final** navigator)
- Members **pull-pay** periodic fees (governance-set menu of native QUAI / ERC-20) to the vault to stay
  `current`; past a grace window **anyone** may `collectFee` a lapsed member — converting their shares to
  loot (default) or burning them — for a small loot keeper reward. Debt model: payment extends `paidThrough`
  forward from where it stood. Menu/fees/period/grace/mode are **immutable** (redeploy to change).
- Permissioned the standard way (`setNavigators([nav],[2])` → `sanctioned`); status is **time-derived** from
  `paid_through` + immutable `graceDuration`. Trust-gate the UI to `sanctioned` (dues touch the cap table).
- Indexer: `ds_subscription_members` (membership state, derived `total_paid`) + `ds_subscription_payments`
  / `ds_subscription_collections` feeds.
  → [`docs/SUBSCRIPTION_NAVIGATOR_SUPPORT.md`](docs/SUBSCRIPTION_NAVIGATOR_SUPPORT.md)

> **App status (2026-06-12):** Onboarder, ERC20Tribute, NFTGated, and Signal have catalog entries +
> ABIs/plugins. **Timelock and Vesting are `status:'planned'`** in `navigatorCatalog.ts` (no ABIs/plugins
> yet). **Budget has a catalog entry + ABI (`status:'shipped'`, `pattern:'treasury'`) but no UI flows yet**
> — deploy/enable-module/create-budget/disburse are specced in `docs/BUDGET_NAVIGATOR_SUPPORT.md`.
> **Subscription has a catalog entry + ABI and full indexer support (shipped 2026-06-12) but is still
> `status:'planned'`** pending the app UI build — specced in `docs/SUBSCRIPTION_NAVIGATOR_SUPPORT.md`. The
> indexer fully supports **all of these** navigator types; the remaining work is app-side UI.

### Allowlist Records

Navigator allowlist records (`daoships.navigator.allowlist` tag) support:
- **Inline format**: `addresses[]` (max 500) + `treeDump`
- **IPFS pointer**: `ipfsCid` (CIDv0 `Qm...` or CIDv1 `baf...`)
- Mutually exclusive -- cannot have both `addresses` and `ipfsCid`
- Pre-DAO records stored with `dao_id = null`, auto-reparented when navigator is registered

---

## 9. Token Operations & Member Tracking

### Balance Sources

Member balances (`shares`, `loot`) come exclusively from **Transfer events** on SharesERC20/LootERC20. The Transfer handler is the canonical source -- `setUp()` mints directly via `sharesToken.mint()` without emitting MintShares.

### EIP-2612 Permit (NEW)

Both SharesERC20 and LootERC20 now support gasless approvals:

```typescript
// Check if permit is supported
const nonce = await sharesToken.nonces(ownerAddress)

// Sign permit off-chain
const signature = await signer.signTypedData(domain, types, {
  owner, spender, value, nonce, deadline
})

// Submit permit + operation in one tx (or separately)
await sharesToken.permit(owner, spender, value, deadline, v, r, s)
```

### Active Member Definition

```sql
shares > 0 OR loot > 0
```

`active_member_count` on ds_daos is derived from this filter and updated atomically.

### Delegation

- **Current state**: `ds_members.delegating_to` (null = self-delegating)
- **Voting power**: `ds_members.voting_power` (from DelegateVotesChanged)
- **History**: `ds_delegations` table (append-only, SERIAL PK)
- Shares are delegatable; Loot is NOT delegatable
- Auto-delegation: shares auto-delegate to self on first mint
- Full burn: delegation cleared, fresh self-delegation on rejoin

### Ragequit

- Member burns shares/loot, receives proportional treasury assets
- Max 20 guild tokens per DAO (prevents out-of-gas)
- `address(0)` in token list = native QUAI
- Retention check: `minRetentionPercent` prevents total supply drain
- Events: only Transfer + Ragequit emitted (no BurnShares/BurnLoot)

---

## 10. Service Architecture

### Core Services (`src/services/core/`)

| Service | Purpose |
|---------|---------|
| `DAOShipService` | DAOShip contract read/write (proposals, voting, governance config) |
| `LauncherService` | DAO creation via `launchDAOShipAndVault()` |
| `NavigatorService` | Navigator interactions (onboarder, ERC20 tribute) |
| `PosterService` | On-chain metadata posting via Poster.sol |
| `TokenService` | Token operations (delegation, voting power, permit) |
| `WalletConnectionService` | Pelagus wallet integration (EIP-1193) |
| `BaseService` | Singleton provider/signer management |

### Indexer Services (`src/services/indexer/`)

| Service | Tables |
|---------|--------|
| `DaoIndexerService` | `ds_daos`, `ds_guild_tokens` |
| `ProposalIndexerService` | `ds_proposals` |
| `MemberIndexerService` | `ds_members` |
| `VoteIndexerService` | `ds_votes` |
| `NavigatorIndexerService` | `ds_navigators`, `ds_navigator_events`, `ds_nft_claims`, `ds_signal_polls`, `ds_signal_votes`, `ds_timelock_changes`, `ds_governance_config_history`, `ds_vesting_schedules`, `ds_vesting_claims` |
| `RecordIndexerService` | `ds_records` |
| `IndexerHealthService` | Indexer health endpoint |

### Utility Services (`src/services/utils/`)

| Service | Purpose |
|---------|---------|
| `ProposalEncoder` | Encodes proposal actions (mint, burn, transfer, governance, setNavigators) |
| `GovernanceEncoder` | Encodes governance config changes |
| `MultiSendEncoder` | MultiSend batch encoding |
| `ProposalStatusService` | Status derivation |
| `SaltMiner` | CREATE2 salt mining (Web Worker) |
| `AddressUtils` | Address validation, normalization, comparison |

### DaoService Facade (`src/services/DaoService.ts`)

Central entry point. Routes to indexer services first, falls back to on-chain RPC. All hooks go through this.

---

## 11. Component Architecture

```
src/components/
+-- common/          # Reusable UI: Button, Card, Modal, TrustBadge, TokenAmount, etc.
+-- layout/          # Layout, Header, Sidebar, DaoLayout
+-- dao/             # DaoCard, DaoProfile, DaoStats, GovernanceConfig, TreasuryView
+-- proposal/        # ProposalCard, StatusBadge, Timeline, VoteButton, forms/
+-- member/          # MemberCard, MemberList, VotingPower, DelegationWidget, RagequitModal
+-- navigator/       # NavigatorCard, NavigatorList, NavigatorDetailCard
|   +-- interactions/  # OnboarderInteraction, ERC20TributeInteraction
+-- launch/          # LaunchWizard
    +-- steps/         # BasicInfoStep, GovernanceStep, MembersStep, NavigatorsStep, VaultStep, ReviewStep
```

---

## 12. Route Structure

Defined in `src/App.tsx`:

```
/                          -> Home (landing page)
/explore                   -> Explore (DAO discovery)
/launch                    -> Launch (create DAO wizard)
/dao/:daoId                -> DAO Layout (nested routes)
  /                        -> Overview (dashboard)
  /proposals               -> Proposal list
  /proposals/new           -> Create proposal
  /proposals/:proposalId   -> Proposal detail
  /members                 -> Member list
  /treasury                -> Treasury view
  /navigators              -> Navigator management
  /settings                -> DAO settings
```

Legacy redirects: `/summon` -> `/launch`, `shamans` -> `navigators`

---

## 13. Security Practices

### Content Safety Rules

```typescript
// NEVER do this with ds_records.content:
dangerouslySetInnerHTML={{ __html: record.content }}

// ALWAYS escape or use sanitized content_json:
<div>{escapeHtml(record.content)}</div>

// Prefer content_json for display:
if (record.content_json?.name) {
  return <h1>{record.content_json.name}</h1>  // Already sanitized
}
```

### Trust Boundaries

| Source | Safety | Examples |
|--------|--------|---------|
| **Contract-derived** | Trusted | shares, loot, voting_power, proposal status flags, guild_tokens |
| **User-supplied** | **UNTRUSTED** | ds_daos.name/description/avatar_img, ds_proposals.details, ds_records.content, ds_navigators.name/description |
| **Indexer-validated** | Sanitized | ds_records.content_json, ds_navigators.navigator_type/name/description |

### Security Utilities (`src/utils/`)

| Module | Purpose |
|--------|---------|
| `sanitize.ts` | `sanitizeHtml()` via DOMPurify (strict allowlist), `stripHtml()` |
| `url.ts` | `isValidUrl()`, `resolveUrl()` (IPFS gateway), `safeHref()` -- blocks javascript:/data:/blob: |
| `bigint.ts` | `safeBigInt()` (crash-safe), `parseBigIntInput()` (form validation) |
| `contentJson.ts` | `safeJsonParse()`, `safeString()`, `safeEntries()` -- prototype pollution safe |
| `realtime.ts` | `isNewerRecord()` -- ordering validation for realtime updates |
| `posterSchemas.ts` | Zod schemas for poster tags |

### Key Rules

1. Never use `dangerouslySetInnerHTML` with user data -- use `sanitizeHtml()` first
2. Always wrap avatar/image URLs in `resolveUrl()` before rendering in `<img src>`
3. Always use `safeBigInt()` instead of bare `BigInt()` for indexer-sourced values
4. Always lowercase addresses before comparing -- use `normalizeAddress()` or `addressesEqual()`
5. Use `Object.entries()` for content_json iteration, never `for...in`
6. Check `permit` deadline >= block.timestamp before rendering permit UI

---

## 14. Testing

**Framework:** Vitest + jsdom + @testing-library/react

```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage
```

**Test files:** `src/**/__tests__/*.test.{ts,tsx}`

---

## 15. Environment Configuration

```bash
# Network
VITE_RPC_URL=https://rpc.orchard.quai.network
VITE_CHAIN_ID=15000
VITE_BLOCK_EXPLORER_URL=https://orchard.quaiscan.io

# Contract addresses (Cyprus1)
VITE_DAOSHIP_AND_VAULT_LAUNCHER=0x0056386fCE771Da46336DE77E8F046c30aBAF732
VITE_DAOSHIP_LAUNCHER=0x00681160732b3141Ddb116F8B946aCf5fB4365fa
VITE_POSTER=0x0010CDE67Dc36f98557Fc686f800F908b755407C
VITE_MULTISEND=0x002ae8A47C2da497fe569AfCF0486410aA1093E0
VITE_QUAIVAULT_FACTORY=0x002d1305D597c157bB975967FA2e5337674b0E5F

# Singleton addresses (needed for CREATE2 salt mining)
VITE_DAOSHIP_SINGLETON=0x00298e9aA7fc36D80D6d7a859154246a0000861A
VITE_SHARES_SINGLETON=0x001a08868a56AFc4679c8020e80cE105b4B7CeA8
VITE_LOOT_SINGLETON=0x004096BF49A948A2D66FD47be1b22ABBef251AF7

# Supabase (optional -- direct RPC mode without)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_NETWORK_SCHEMA=dev  # dev | testnet | mainnet

# Infrastructure
VITE_QUAIVAULT_URL=https://testnet.quaivault.org
VITE_INDEXER_HEALTH_URL=http://localhost:8080/health
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/
```

---

## 16. Address Handling

Quai Network uses a sharded address scheme. Cyprus-1 addresses start with `0x00`.

**Utilities in `src/services/utils/AddressUtils.ts`:**
- `isValidCyprus1Address(addr)` -- validates `0x00` prefix + quais check
- `normalizeAddress(addr)` -- lowercase + format validation, returns null if invalid
- `addressesEqual(a, b)` -- case-insensitive comparison with validation
- `lowercaseAddress(addr)` -- simple lowercase conversion

**Rules:**
- Always normalize before comparing or querying
- Always lowercase before Supabase `.eq()` filters
- Validate Cyprus-1 prefix for user-supplied addresses in forms
- Composite IDs use `-` separator: `{dao_id}-{member_address}`, `{dao_id}-{proposal_id}`

---

## 17. Breaking Changes & Migration Notes

### Navigator Trust Refactor + New Navigators (June 2026)

1. **`ds_navigators` gained `trust_status`, `permission_ever_granted`, `deploy_block`.** Mirror them into
   `src/types/navigator.ts`. **Default read-only navigator feeds to `trust_status = 'sanctioned'`.**
2. **`is_active` redefined to "functional now?"** — no longer "has permission." Audit every `is_active`
   read; replace "has permission" inferences with `permission > 0` / `permission_ever_granted` (§8).
3. **`dao_id` is bound for every navigator at deploy** (no dao-less orphan rows), but self-asserted for
   read-only navs. The FK to `ds_daos` was dropped.
4. **New tag `daoships.dao.navigators`** (VERIFIED, vault-only) — the navigator-**sanction** post. Full-set,
   last-write-wins. Add `POSTER_TAGS.DAO_NAVIGATORS` + the proposal-encoded sanction flow (§6).
5. **NFTGatedNavigator** shipped — per-token claims in `ds_nft_claims` (Option B; **no** `nft_claim`
   event_type). Catalog already `shipped`.
6. **SignalNavigator** shipped — read-only polls in `ds_signal_polls`/`ds_signal_votes`, materialized only
   for `sanctioned` navs (indexer backfills on sanction). Catalog already `shipped`.
7. **TimelockNavigator** shipped on the indexer — `ds_timelock_changes` + `ds_governance_config_history`
   with a `bypassed_timelock` flag. **App still `status:'planned'`** — route config changes through
   `queueChange`; warn on bypass. Spec: `docs/TIMELOCK_NAVIGATOR_SUPPORT.md`.
8. **VestingNavigator** shipped on the indexer — `ds_vesting_schedules` + `ds_vesting_claims`. **App still
   `status:'planned'`.** Vesting ≠ balance (no escrow); status/claimable time-derived. Spec:
   `docs/VESTING_NAVIGATOR_SUPPORT.md`.
9. **BudgetNavigator** shipped on the indexer — the **module** trust class: authority is a vault
   `EnabledModule`, NOT `setNavigators`. `ds_budgets` + `ds_budget_disbursements`; trust feed
   `ds_vault_module_events`. **App `status:'shipped'` (catalog + ABI) but no UI flows yet.** Gate display
   on `trust_status='sanctioned'` / `is_active`. Spec: `docs/BUDGET_NAVIGATOR_SUPPORT.md`.
10. **SubscriptionNavigator** shipped on the indexer (2026-06-12) — recurring dues, permissioned MANAGER.
   `ds_subscription_members` (membership state, derived `total_paid`) + `ds_subscription_payments` /
   `ds_subscription_collections` feeds; status time-derived from `paid_through` + `graceDuration`. **App
   still `status:'planned'`** pending the UI build. The **9th and final** navigator. Spec:
   `docs/SUBSCRIPTION_NAVIGATOR_SUPPORT.md`.
11. **Realtime added** for `ds_nft_claims`, `ds_signal_polls`, `ds_signal_votes`, `ds_timelock_changes`,
   `ds_governance_config_history`, `ds_vesting_schedules`, `ds_budgets`, `ds_budget_disbursements`,
   `ds_vault_module_events`, `ds_subscription_members`, `ds_subscription_payments`,
   `ds_subscription_collections` (`ds_vesting_claims` is append-only, not published).

### From Contracts (April 2026)

1. **INavigator is mandatory** -- All navigators must implement it and emit `NavigatorDeployed`
2. **Proposal status storage changed** -- `bool[4]` -> `uint8 statusFlags` (ABI-compatible via `getProposalStatus()`)
3. **MAX_GUILD_TOKENS = 20** -- Ragequit token set is capped
4. **EIP-2612 permit on both tokens** -- New `permit()`, `nonces()`, `DOMAIN_SEPARATOR()` functions
5. **New proposal state: Expired** -- Ready proposals auto-expire after `defaultExpiryWindow`
6. **Defeated proposals processable** -- With empty data only
7. **Parallel proposal execution** -- No sequential queue requirement

### From Indexer Audit (April 2026)

1. **`profile_source` is now a union type** -- Only `'vault'` | `'launcher'` | `null`
2. **`content` column documented as UNTRUSTED** -- Schema comment added; frontends MUST escape
3. **Navigator metadata sanitized** -- `navigatorType`, `name`, `description` have control chars stripped
4. **Health endpoint caching** -- 5-second TTL on `/health` responses
5. **`HEALTH_CHECK_HOST` config** -- Defaults to `0.0.0.0`; set to `127.0.0.1` for bare-metal
6. **DAO totals atomic** -- `total_shares`/`total_loot` updated via SQL function, no more read-modify-write
7. **New index**: `idx_ds_votes_proposal_approved` on `(proposal_id, approved)` -- faster vote queries
8. **New index**: `idx_ds_navigators_address` on `(navigator_address)` -- cross-DAO navigator lookups
9. **Dedup pruning in backfill** -- `ds_processed_logs` now pruned during chunked processing
10. **Array cap in JSONB sanitization** -- Max 1000 items per array in `content_json`

### From Indexer Sync (April 22, 2026)

1. **`/health` adds reindex flags** -- `details.requiresFullReindex` (boolean), `details.reindexReason` (string\|null), `details.reindexFlaggedAt` (ISO ts\|null). When `requiresFullReindex` is true the indexer forces overall `status: 'unhealthy'` even if individual checks pass. App surfaces this via `ReindexRequiredBanner` (warning, distinct from "indexer offline"). Operator clears the flag server-side; the app cannot.
2. **`/health` adds `details.recentRanges`** -- Ring buffer of recent `processBlockRange` summaries (operational telemetry). Currently unused by the app; safe to ignore.
3. **`ds_navigators.allowlist_root` (additive)** -- Merkle root cached at `NavigatorDeployed`. The indexer now verifies allowlist records against this cached root instead of issuing RPCs. App still reads the live root via `NavigatorService.allowlistRoot()` for backup-file verification (UX requires on-chain truth at action time); the cached column is currently not consumed.
4. **`ds_indexer_state` adds reindex columns** -- `requires_full_reindex`, `reindex_reason`, `reindex_flagged_at`. App does not query this table directly; values are surfaced via `/health` (above).
5. **Atomic transfer apply (`ds_apply_transfer`)** -- Member balance writes no longer go through client-side read-compute-write. Observable difference: fewer transient zero-balance windows during batch replay. UI logic that reacts to `balance === 0` is now strictly correct rather than occasionally flickering.
6. **`content` UNTRUSTED reminder** -- Schema now carries the inline comment `M6: Raw on-chain data. UNTRUSTED. Frontends MUST escape before rendering. Use content_json for sanitized data.` This is documentation, not a behavior change. App audit (2026-04-22): every render path uses `content_json`; raw `content` is never rendered. Keep it that way.

### Migration from QDL

This project was rebranded from **QDL (Quai DAO Launcher)** to **DAO Ships** in March 2026:
- Baal -> DAOShip, Shaman -> Navigator, Summoner -> Launcher
- `qdl_*` tables -> `ds_*` tables, `qdl.*` tags -> `daoships.*` tags
- Legacy redirects maintained: `/summon` -> `/launch`, `shamans` -> `navigators`

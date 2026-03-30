# DAO Ships Frontend — Development Guide

This guide covers how the `daoships-app` frontend connects to the `daoships-indexer` Supabase backend, what's built, and the patterns to follow.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema Reference](#2-database-schema-reference)
3. [Supabase Query Patterns](#3-supabase-query-patterns)
4. [Realtime Subscriptions](#4-realtime-subscriptions)
5. [Poster Integration & Trust Levels](#5-poster-integration--trust-levels)
6. [Service Architecture](#6-service-architecture)
7. [Component Architecture](#7-component-architecture)
8. [Route Structure](#8-route-structure)
9. [Security Practices](#9-security-practices)
10. [Testing](#10-testing)
11. [Environment Configuration](#11-environment-configuration)
12. [Address Handling](#12-address-handling)

---

## 1. Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Quai Chain   │────▶│ daoships-indexer  │────▶│   Supabase    │
│  (Cyprus1)    │     │ (event listener)  │     │  (PostgreSQL) │
└──────┬───────┘     └──────────────────┘     └───────┬───────┘
       │                                              │
       │  on-chain reads/writes                       │  indexed reads
       │  (quais.js via Pelagus)                      │  (supabase-js)
       ▼                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    daoships-app (React)                      │
│                                                             │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐ │
│  │  core/        │  │  indexer/       │  │  hooks/         │ │
│  │  DAOShipSvc   │  │  DaoIndexer    │  │  useProposals   │ │
│  │  LauncherSvc  │  │  ProposalIdx   │  │  useMembers     │ │
│  │  PosterSvc    │  │  MemberIdx     │  │  useVoting      │ │
│  │  NavigatorSvc │  │  VoteIdx       │  │  useLaunch      │ │
│  │  TokenSvc     │  │  NavigatorIdx  │  │  useDelegation  │ │
│  └──────────────┘  └────────────────┘  └─────────────────┘ │
│                          │                                   │
│                   DaoService (facade)                        │
└─────────────────────────────────────────────────────────────┘
```

**Data flow:**
- **Reads**: Hook → DaoService → IndexerService (Supabase) → fallback to on-chain RPC
- **Writes**: Hook → DaoService → Core Service → Contract interaction (via Pelagus wallet)
- **Metadata**: PosterService → Poster.sol → indexed into `ds_records` by the indexer

**Key dependencies:**
- `quais` — Quai Network's ethers.js fork
- `@supabase/supabase-js` — Direct Supabase client (PostgREST, not GraphQL)
- `@tanstack/react-query` — Server state management with caching
- `zustand` — Client state (wallet, UI, current DAO)
- `react-hook-form` + `zod` — Form validation
- `dompurify` — HTML sanitization for user-generated content

---

## 2. Database Schema Reference

All tables use the `ds_` prefix and live in the network-specific schema (`dev`, `testnet`, or `mainnet`).

### ds_daos
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(42) | DAOShip contract address (PK) |
| `created_at` | TIMESTAMPTZ | |
| `created_by` | VARCHAR(42) | Deployer wallet |
| `tx_hash` | VARCHAR(66) | |
| `loot_address` | VARCHAR(42) | |
| `shares_address` | VARCHAR(42) | |
| `avatar` | VARCHAR(42) | Vault/treasury address |
| `launcher` | VARCHAR(42) | Factory that deployed |
| `new_vault` | BOOLEAN | Whether vault was created during launch |
| `grace_period` | NUMERIC(78,0) | Seconds |
| `voting_period` | NUMERIC(78,0) | Seconds |
| `proposal_offering` | NUMERIC(78,0) | Wei |
| `quorum_percent` | NUMERIC(78,0) | Basis points (x100) |
| `sponsor_threshold` | NUMERIC(78,0) | Wei |
| `min_retention_percent` | NUMERIC(78,0) | Basis points |
| `total_shares` | NUMERIC(78,0) | |
| `total_loot` | NUMERIC(78,0) | |
| `name` | TEXT | From Poster (untrusted) |
| `description` | TEXT | From Poster (untrusted) |
| `avatar_img` | TEXT | From Poster (untrusted) |
| `profile_source` | TEXT | 'launcher' or 'vault' |

### ds_proposals
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR | `${dao_id}-${proposal_id}` |
| `dao_id` | VARCHAR(42) | FK to ds_daos |
| `proposal_id` | VARCHAR | On-chain numeric ID |
| `submitter` | VARCHAR(42) | |
| `sponsored` | BOOLEAN | |
| `sponsor` | VARCHAR(42) | |
| `voting_starts/ends` | TIMESTAMPTZ | |
| `grace_ends` | TIMESTAMPTZ | |
| `yes_votes/no_votes` | NUMERIC(78,0) | Count of voters |
| `yes_balance/no_balance` | NUMERIC(78,0) | Weighted by shares |
| `passed` | BOOLEAN | |
| `processed` | BOOLEAN | |
| `cancelled` | BOOLEAN | |
| `details` | TEXT | From Poster (untrusted) |
| `proposal_data` | TEXT | Encoded action bytes |

### ds_members
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR | `${dao_id}-${member_address}` |
| `dao_id` | VARCHAR(42) | |
| `member_address` | VARCHAR(42) | |
| `shares` | NUMERIC(78,0) | |
| `loot` | NUMERIC(78,0) | |
| `delegating_to` | VARCHAR(42) | |
| `voting_power` | NUMERIC(78,0) | Delegated share power |

### ds_votes
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR | `${proposal_id}-${voter}` |
| `dao_id` | VARCHAR(42) | |
| `proposal_id` | VARCHAR | FK to ds_proposals |
| `voter` | VARCHAR(42) | |
| `approved` | BOOLEAN | |
| `balance` | NUMERIC(78,0) | Voting weight |

### ds_navigators
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR | `${dao_id}-${navigator_address}` |
| `dao_id` | VARCHAR(42) | |
| `navigator_address` | VARCHAR(42) | |
| `permission` | INTEGER | 0-7 bitmask |
| `permission_label` | TEXT | Enum string |
| `is_active` | BOOLEAN | |
| `paused` | BOOLEAN | |
| `navigator_type` | TEXT | |
| `name` | TEXT | From Poster |
| `description` | TEXT | From Poster |

### ds_navigator_events
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR | |
| `dao_id` | VARCHAR(42) | |
| `navigator_address` | VARCHAR(42) | |
| `event_type` | TEXT | |
| `contributor` | VARCHAR(42) | |
| `shares_minted` | NUMERIC(78,0) | |
| `loot_minted` | NUMERIC(78,0) | |
| `amount` | NUMERIC(78,0) | |

### ds_records
| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR | |
| `dao_id` | VARCHAR(42) | |
| `user_address` | VARCHAR(42) | |
| `tag` | TEXT | One of 14 `daoships.*` tags |
| `content` | TEXT | Raw JSON string |
| `content_json` | JSONB | Parsed by indexer |
| `trust_level` | TEXT | verified, verified_initial, semi_trusted, member |

### Other tables
- `ds_guild_tokens` — ERC-20 tokens accepted for ragequit
- `ds_ragequits` — Ragequit events (shares_burned, loot_burned, tokens, amounts)
- `ds_delegations` — Delegation history (delegator, from_delegate, to_delegate)
- `ds_indexer_state` — Indexer sync state (last_block_number, is_syncing)

---

## 3. Supabase Query Patterns

All indexer services are in `src/services/indexer/`. They use the nullable `supabase` client from `src/config/supabase.ts`.

```typescript
// Example: Get a DAO by ID
const { data, error } = await supabase
  .from('ds_daos')
  .select('*')
  .eq('id', daoId.toLowerCase())
  .single()

// Example: List proposals with pagination
const { data, error } = await supabase
  .from('ds_proposals')
  .select('*')
  .eq('dao_id', daoId.toLowerCase())
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1)

// Example: Get records by tag
const { data, error } = await supabase
  .from('ds_records')
  .select('*')
  .eq('dao_id', daoId.toLowerCase())
  .eq('tag', 'daoships.dao.announcement')
  .order('created_at', { ascending: false })
```

**Important patterns:**
- Always lowercase addresses before querying: `.eq('id', daoId.toLowerCase())`
- Use `select('*')` for full rows or `select('id, name, shares')` for partial
- Indexer services return `null` when `supabase` client is null (direct-RPC mode)
- The `DaoService` facade handles the indexer→RPC fallback automatically

---

## 4. Realtime Subscriptions

Realtime hooks subscribe to Supabase Postgres Changes and invalidate React Query cache:

```typescript
// From useRealtimeProposal.ts
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

Current realtime hooks: `useRealtimeProposal`, `useRealtimeVotes`

---

## 5. Poster Integration & Trust Levels

### 14 Poster Tags

All tags use the `daoships.*` namespace (defined in `src/types/poster.ts`):

| Tag | Purpose | Posted By |
|---|---|---|
| `daoships.dao.profile.initial` | Initial DAO profile from deployer | Deployer wallet |
| `daoships.dao.profile` | DAO profile from vault (governance) | Vault contract |
| `daoships.dao.profile.update` | Partial profile update | Vault contract |
| `daoships.dao.announcement` | DAO announcement | Vault or member |
| `daoships.dao.tag` | DAO category tag | Vault |
| `daoships.member.profile` | Member profile | Member wallet |
| `daoships.member.profile.update` | Partial member profile update | Member wallet |
| `daoships.member.statement` | Member statement | Member wallet |
| `daoships.proposal.rationale` | Proposal rationale | Submitter |
| `daoships.proposal.vote.reason` | Vote reason | Voter |
| `daoships.treasury.label` | Treasury transaction label | Vault |
| `daoships.treasury.report` | Treasury report | Vault or member |
| `daoships.navigator.metadata` | Navigator metadata | Navigator contract |
| `daoships.navigator.status` | Navigator status update | Navigator contract |

### Trust Levels (defined in `src/types/trust.ts`)

| Level | Description |
|---|---|
| `verified` | Posted by DAO vault or DAOShip contract (governance-voted) |
| `verified_initial` | Posted by deployer wallet (pre-governance) |
| `semi_trusted` | Posted by a Navigator contract |
| `member` | Posted by a wallet with shares > 0 |
| `untrusted` | Rejected by indexer (never stored) |

The `TrustBadge` component (`src/components/common/TrustBadge.tsx`) renders a colored badge per trust level.

---

## 6. Service Architecture

### Core Services (`src/services/core/`)

| Service | Purpose |
|---|---|
| `DAOShipService` | DAOShip contract read/write (proposals, voting, governance config) |
| `LauncherService` | DAO creation via `launchDAOShipAndVault()` |
| `NavigatorService` | Navigator interactions (onboarder, ERC20 tribute) |
| `PosterService` | On-chain metadata posting via Poster.sol |
| `TokenService` | Token operations (delegation, voting power) |
| `WalletConnectionService` | Pelagus wallet integration (EIP-1193) |
| `BaseService` | Singleton provider/signer management |

### Indexer Services (`src/services/indexer/`)

| Service | Tables |
|---|---|
| `DaoIndexerService` | `ds_daos`, `ds_guild_tokens` |
| `ProposalIndexerService` | `ds_proposals` |
| `MemberIndexerService` | `ds_members` |
| `VoteIndexerService` | `ds_votes` |
| `NavigatorIndexerService` | `ds_navigators`, `ds_navigator_events` |
| `RecordIndexerService` | `ds_records` |
| `IndexerHealthService` | Indexer health endpoint |

### Utility Services (`src/services/utils/`)

| Service | Purpose |
|---|---|
| `ProposalEncoder` | Encodes proposal actions (mint, burn, transfer, governance, setNavigators) |
| `GovernanceEncoder` | Encodes governance config changes |
| `MultiSendEncoder` | MultiSend batch encoding |
| `ProposalStatusService` | Status derivation |
| `SaltMiner` | CREATE2 salt mining (Web Worker) |
| `AddressUtils` | Address validation, normalization, comparison |

### DaoService Facade (`src/services/DaoService.ts`)

Central entry point. Routes to indexer services first, falls back to on-chain RPC. All hooks go through this.

---

## 7. Component Architecture

```
src/components/
├── common/          # Reusable UI: Button, Card, Modal, TrustBadge, TokenAmount, etc.
├── layout/          # Layout, Header, Sidebar, DaoLayout
├── dao/             # DaoCard, DaoProfile, DaoStats, GovernanceConfig, TreasuryView
├── proposal/        # ProposalCard, StatusBadge, Timeline, VoteButton, forms/
├── member/          # MemberCard, MemberList, VotingPower, DelegationWidget, RagequitModal
├── navigator/       # NavigatorCard, NavigatorList, NavigatorDetailCard
│   └── interactions/  # OnboarderInteraction, ERC20TributeInteraction, CheckInInteraction
└── launch/          # LaunchWizard
    └── steps/         # BasicInfoStep, GovernanceStep, MembersStep, NavigatorsStep, VaultStep, ReviewStep
```

---

## 8. Route Structure

Defined in `src/App.tsx`:

```
/                          → Home (landing page)
/explore                   → Explore (DAO discovery)
/launch                    → Launch (create DAO wizard)
/dao/:daoId                → DAO Layout (nested routes)
  /                        → Overview (dashboard)
  /proposals               → Proposal list
  /proposals/new           → Create proposal
  /proposals/:proposalId   → Proposal detail
  /members                 → Member list
  /treasury                → Treasury view
  /navigators              → Navigator management
  /settings                → DAO settings
```

Legacy redirects: `/summon` → `/launch`, `shamans` → `navigators`

---

## 9. Security Practices

### Trust Boundaries

**Contract-derived data (trusted):** Most fields in `ds_members`, `ds_votes`, `ds_guild_tokens`, `ds_ragequits`, `ds_delegations`.

**User-supplied data (UNTRUSTED):** `ds_daos.name/description/avatar_img`, `ds_proposals.details/proposal_data`, `ds_navigators.name/description/config`, ALL `ds_records` content fields.

### Security Utilities (`src/utils/`)

| Module | Purpose |
|---|---|
| `sanitize.ts` | `sanitizeHtml()` via DOMPurify (strict allowlist), `stripHtml()` |
| `url.ts` | `isValidUrl()`, `resolveUrl()` (IPFS→gateway), `safeHref()` — blocks javascript:/data:/blob: |
| `bigint.ts` | `safeBigInt()` (crash-safe), `parseBigIntInput()` (form validation) |
| `contentJson.ts` | `safeJsonParse()`, `safeString()`, `safeEntries()` — prototype pollution safe |
| `realtime.ts` | `isNewerRecord()` — ordering validation for realtime updates |
| `posterSchemas.ts` | Zod schemas for all 14 poster tags |

### CSP Headers (vercel.json)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https: ipfs:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.quai.network;
font-src 'self' https://fonts.gstatic.com;
object-src 'none'; base-uri 'self'; form-action 'self';
frame-src 'none'; frame-ancestors 'none';
worker-src 'self' blob:;
```

Additional headers: `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### Key Rules
- Never use `dangerouslySetInnerHTML` with user data — use `sanitizeHtml()` first
- Always wrap avatar URLs in `resolveUrl()` before rendering in `<img src>`
- Always use `safeBigInt()` instead of bare `BigInt()` for indexer-sourced values
- Always lowercase addresses before comparing — use `normalizeAddress()` or `addressesEqual()`
- Use `Object.entries()` for content_json iteration, never `for...in`

---

## 10. Testing

**Framework:** Vitest + jsdom + @testing-library/react

**Run tests:**
```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage
```

**Test files:** `src/**/__tests__/*.test.{ts,tsx}`

**Current coverage (161 tests):**

| Module | Tests | Coverage |
|---|---|---|
| `utils/sanitize.ts` | 18 | XSS vectors, tag allowlist, URI schemes |
| `utils/url.ts` | 24 | Scheme validation, IPFS resolution |
| `utils/bigint.ts` | 14 | Null/invalid/valid, custom fallbacks |
| `utils/contentJson.ts` | 18 | Prototype pollution, null safety |
| `utils/realtime.ts` | 10 | Block number ordering |
| `utils/posterSchemas.ts` | 16 | Schema validation per tag |
| `utils/format.ts` | 30 | Token formatting, address truncation |
| `utils/time.ts` | 31 | Duration, countdown, relative time |

---

## 11. Environment Configuration

```bash
# Network
VITE_RPC_URL=https://rpc.orchard.quai.network
VITE_CHAIN_ID=15000
VITE_BLOCK_EXPLORER_URL=https://orchard.quaiscan.io

# Contract addresses (Cyprus1)
VITE_DAOSHIP_AND_VAULT_LAUNCHER=0x...
VITE_DAOSHIP_LAUNCHER=0x...
VITE_POSTER=0x...
VITE_MULTISEND=0x...
VITE_QUAIVAULT_FACTORY=0x...

# Singleton addresses (needed for CREATE2 salt mining)
VITE_DAOSHIP_SINGLETON=0x...
VITE_SHARES_SINGLETON=0x...
VITE_LOOT_SINGLETON=0x...
VITE_VAULT_SINGLETON=0x...

# Supabase (optional — direct RPC mode without)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_NETWORK_SCHEMA=dev  # dev | testnet | mainnet

# Infrastructure
VITE_QUAIVAULT_URL=https://testnet.quaivault.org
VITE_INDEXER_HEALTH_URL=http://localhost:8080/health
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/  # Optional, for avatar resolution
```

---

## 12. Address Handling

Quai Network uses a sharded address scheme. Cyprus-1 addresses start with `0x00`.

**Utilities in `src/services/utils/AddressUtils.ts`:**
- `isValidCyprus1Address(addr)` — validates `0x00` prefix + quais check
- `normalizeAddress(addr)` — lowercase + format validation, returns null if invalid
- `addressesEqual(a, b)` — case-insensitive comparison with validation
- `lowercaseAddress(addr)` — simple lowercase conversion

**Rules:**
- Always normalize before comparing or querying
- Always lowercase before Supabase `.eq()` filters
- Validate Cyprus-1 prefix for user-supplied addresses in forms

---

## Migration History

This project was rebranded from **QDL (Quai DAO Launcher)** to **DAO Ships** in March 2026. Key terminology changes:
- Baal → DAOShip (core DAO contract)
- Shaman → Navigator (plugin contracts)
- Summoner/summon → Launcher/launch (factory contracts)
- `qdl_*` tables → `ds_*` tables
- `qdl.*` poster tags → `daoships.*` poster tags

Legacy route redirects (`/summon` → `/launch`, `shamans` → `navigators`) are maintained for backward compatibility.

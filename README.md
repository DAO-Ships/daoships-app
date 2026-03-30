# DAO Ships

Frontend application for launching, governing, and managing DAOs on Quai Network.

## Stack

- **React 18** + TypeScript + Vite
- **Tailwind CSS** with custom DAO design tokens (light/dark mode)
- **quais** for Quai Network contract interactions
- **wagmi** + Reown AppKit for wallet connection (Pelagus, WalletConnect)
- **Supabase** for indexed on-chain data (via daoships-indexer)
- **TanStack Query** for server state + realtime subscriptions
- **Zustand** for client state (sidebar, theme, wallet)

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env

# Start dev server
npm run dev
```

## Environment Variables

See `.env.example` for all available variables. Required:

| Variable | Description |
|---|---|
| `VITE_RPC_URL` | Quai Network RPC endpoint |
| `VITE_WC_PROJECT_ID` | Reown (WalletConnect) project ID |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

Contract addresses have sensible defaults for the current Cyprus-1 deployment. Override via `VITE_DAOSHIP_AND_VAULT_LAUNCHER`, `VITE_POSTER`, etc.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint TypeScript files |

## Project Structure

```
src/
  App.tsx                   Main router
  pages/                    Route-level page components
    Home.tsx                Landing page
    Explore.tsx             Browse all DAOs
    Launch.tsx              DAO creation wizard
    dao/                    DAO-scoped pages
      Overview.tsx          DAO dashboard (profile + stats)
      Proposals.tsx         Proposal list
      ProposalDetail.tsx    Proposal detail with voting
      NewProposal.tsx       Proposal creation (8 types)
      Members.tsx           Member list + delegates tab
      Treasury.tsx          Treasury balances + labels
      Navigators.tsx        Navigator list
      NavigatorDetail.tsx   Navigator interaction (onboard)
      Settings.tsx          Governance configuration
  components/
    common/                 Reusable UI (Card, Button, Modal, etc.)
    layout/                 Layout, Sidebar, Header, DaoLayout
    dao/                    DAO display (DaoProfile, DaoStats, etc.)
    member/                 Member cards, avatars, delegation
    proposal/               Proposal cards, actions, forms
    navigator/              Navigator plugins (Onboarder, ERC20Tribute)
    launch/                 Multi-step launch wizard
  hooks/                    React Query hooks + custom hooks
  services/
    DaoService.ts           Facade for all DAO contract interactions
    core/                   Direct contract services (Base, Token, Poster, Navigator)
    indexer/                Supabase query services
    utils/                  ProposalEncoder, ProposalStatusService
  store/                    Zustand stores (dao, ui, wallet)
  types/                    TypeScript interfaces
  utils/                    Formatting, validation, clipboard, sanitization
  config/                   Contracts, ABIs, wagmi, Supabase, Tailwind
```

## Architecture

### Data Flow

1. **On-chain writes** go through `DaoService` and core services, using `quais` with a wallet signer
2. **On-chain reads** are served by the daoships-indexer via Supabase (the `ds_*` tables)
3. **Metadata** (DAO profiles, member profiles, announcements) is posted via the Poster contract and indexed into `ds_records`
4. **Realtime updates** use Supabase Realtime subscriptions on key tables

### Poster Protocol

The app uses 7 Poster tags for on-chain metadata:

| Tag | Purpose | Trust Level |
|---|---|---|
| `daoships.dao.profile.initial` | DAO profile set by deployer | Verified Initial |
| `daoships.dao.profile` | DAO profile via governance | Verified |
| `daoships.dao.announcement` | Official DAO announcements | Verified |
| `daoships.member.profile` | Member display name, bio, avatar | Member |
| `daoships.proposal.vote.reason` | Post-vote reasoning | Member |
| `daoships.treasury.label` | Address labels via governance | Verified |
| `daoships.navigator.metadata` | Navigator name/description | Semi-Trusted |

All posts include `schemaVersion: '1.0'` and are validated against content schemas before submission.

### Navigator Plugins

Navigator interactions are handled by type-specific plugin components:

- **OnboarderPlugin** — Native QUAI tribute for shares/loot (multiplier or fixed-price mode)
- **ERC20TributePlugin** — ERC-20 token tribute with ERC-2612 permit support for single-transaction onboarding

### Proposal Types

8 proposal types, all encoded as MultiSend calldata:

Funding, Membership, Guild Tokens, Governance Config, Navigators, Profile Update, Announcement, Custom Action

## Related Repositories

- **daoships-contracts** — Solidity smart contracts (DAOShip, navigators, tokens)
- **daoships-indexer** — Event indexer that populates the Supabase database

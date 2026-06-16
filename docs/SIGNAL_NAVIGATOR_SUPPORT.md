# Supporting the SignalNavigator in the app

How to wire DAO Ships' `SignalNavigator` into this app — the **DAO-creator** flow (deploy + sanction),
the **member** flow (create poll / vote / read results), and the indexer reads behind it. Contract
reference: `daoships-contracts/contracts/navigators/SignalNavigator.sol` and
`daoships-contracts/docs/NAVIGATORS.md` (SignalNavigator — SHIPPED). Indexer data model:
`daoships-indexer/docs/FRONTEND_INTEGRATION.md` (NavigatorRow trust fields, `ds_signal_polls`/
`ds_signal_votes`, the sanction proposal pattern).

> **Model:** a `SignalNavigator` runs non-binding, **share-weighted** polls ("temperature checks").
> It holds **no permission**, never calls DAOShip, and is therefore **never registered via
> `setNavigators()`**. Members `createPoll` → `vote` → results are tallied on-chain. Voting power is a
> **snapshot at poll start** (`votingStarts - 1`) and **excludes loot** (shares only).

> ### ⚠️ Three critical, non-obvious couplings — read first
> 1. **"Signal Navigator" ≠ the existing "Signal proposal."** `src/components/proposal/forms/SignalForm.tsx`
>    is a *non-executing DAOShip **proposal*** (title + description, goes through the normal proposal
>    lifecycle). The **SignalNavigator** is a separate read-only **contract** with its own on-chain
>    polls. Do **not** reuse `SignalForm` for navigator polls — they are unrelated. (Consider renaming
>    the proposal one to `SignalProposalForm` to kill the ambiguity.)
> 2. **Polls only appear after the DAO *sanctions* the navigator.** The indexer **defers
>    materialization**: `ds_signal_polls`/`ds_signal_votes` stay empty until the DAO endorses the
>    navigator via a vault `daoships.dao.navigators` proposal (§3), at which point the indexer
>    backfills its poll history. So **deploy alone is not enough for polls to show in the default
>    feed** — the sanction flow (§3) is mandatory, not optional. Until then a poll is queryable from
>    chain but the indexer-backed UI will be empty (by design — anti-spam).
> 3. **The Signal Navigator is POST-LAUNCH-ONLY — never offer it in the launch wizard.** The indexer's
>    `handleNavigatorDeployed` applies a **resolution gate** (`src/handlers/daoship.ts`): a read-only
>    navigator whose DAO is **not yet indexed** is *ignored outright* — **no `ds_navigators` row is ever
>    written, and the log is marked processed so it is never retried.** At launch the DAO doesn't exist in
>    `ds_daos` yet, so a Signal navigator deployed *during or before* launch is **permanently dropped** —
>    the only recovery is deploying a fresh instance after the DAO is live and indexed. This is **unique to
>    read-only navigators**: permissioned ones (Onboarder/Tribute/NFTGated/Timelock/Vesting) are recorded
>    even against an unknown DAO and promoted later by `NavigatorSet`, so they are fine at launch. **Add
>    Signal only from the DAO's navigator-management page**, against an already-indexed DAO (§2).

---

## 0. Fix the catalog entry first

`src/config/navigatorCatalog.ts` has the `SignalNavigator` entry at `status: 'planned'`. Flip it and
align the copy with the shipped contract:

```ts
{
  type: 'SignalNavigator',
  name: 'Signal Navigator',
  icon: NAVIGATOR_ICONS.signal,
  shortDescription: 'Non-binding governance polls',
  description: 'Share-weighted temperature-check polls — non-binding, no on-chain execution',
  permission: 0,
  permissionLabel: 'None',
  pattern: 'information',
  status: 'shipped',                        // was 'planned'
  features: [
    'Share-weighted polls (loot excluded)',
    'Snapshot at poll start (anti vote-buying)',
    'Scheduled or immediate polls',
    '2–10 options, custom durations',
    'No permission — needs DAO sanction to surface',
  ],
  warningText: 'Non-binding & read-only. Polls surface only after the DAO sanctions this navigator via governance.',
},
```

> `TimelockNavigator` (GOVERNOR) and `VestingNavigator` (MANAGER) are also shipped — and the indexer now
> fully supports them (timelock change lifecycle + **bypass detection**; vesting schedules + claims). They
> are **separate** app efforts with their own guides: [`TIMELOCK_NAVIGATOR_SUPPORT.md`](TIMELOCK_NAVIGATOR_SUPPORT.md)
> and [`VESTING_NAVIGATOR_SUPPORT.md`](VESTING_NAVIGATOR_SUPPORT.md). Unlike Signal they're permissioned, so
> they index as `trust_status='sanctioned'` with no sanction step — but they **do** need new indexer reads
> (`ds_timelock_changes`/`ds_governance_config_history`, `ds_vesting_schedules`/`ds_vesting_claims`).

---

## 1. Add ABI + bytecode

Match `src/config/abi/`:
- `src/config/abi/SignalNavigator.json` — the `abi` array from
  `daoships-contracts/artifacts/contracts/navigators/SignalNavigator.sol/SignalNavigator.json`.
- `src/config/abi/SignalNavigator.bytecode.ts` — creation bytecode, mirroring `OnboarderNavigator.bytecode.ts`
  (used by `NavigatorDeployService`).

---

## 2. DAO-creator flow — deploy (no registration)

> **This flow lives on the DAO's navigator-management page, NOT the launch wizard** (see critical coupling
> #3). Concretely: the launch wizard's `NavigatorsStep` must **exclude read-only navigator types**. Don't
> rely on `status === 'shipped'` to populate the wizard (Signal is shipped). Filter the catalog by an
> explicit rule — e.g. `permission > 0`, or add a `launchEligible: false` flag to the read-only catalog
> entries — so Signal (and any future read-only navigator) can only be added post-launch. A Signal entry
> reaching the wizard will deploy a contract the indexer silently drops.

### 2.1 Config + validation

Constructor args (exact order):

```
_daoShip, _minSharesToCreatePoll, _minDuration, _maxDuration, _maxStartDelay, _name, _description
```

| Field | Notes / mirror the constructor reverts (fail fast → avoid `InvalidConfig`) |
|---|---|
| `minSharesToCreatePoll` | Min voting power (wei) to open a poll. `0` = anyone with any power. |
| `minDuration` | seconds, **> 0**. |
| `maxDuration` | seconds, `>= minDuration` and `<= MAX_WINDOW` (3650 days). |
| `maxStartDelay` | seconds, `<= MAX_WINDOW`. **`0` = immediate-only** (no scheduling). |
| `name`, `description` | optional metadata (emitted in `NavigatorDeployed`). |

Add a `SignalNavigator` branch in `src/utils/navigatorValidation.ts`:
`minDuration > 0`, `minDuration <= maxDuration <= MAX_WINDOW`, `maxStartDelay <= MAX_WINDOW`.

### 2.2 Deploy (`src/services/core/NavigatorDeployService.ts`)

Add a `SignalNavigator` case: `quais.ContractFactory(abi, bytecode, signer).deploy(...)` with the 7
args above. **No `setNavigators` / registration step** — it holds no permission. Capture the address.

> The indexer discovers it from `NavigatorDeployed` and creates a `ds_navigators` row immediately with
> `permission = 0`, `is_active = true`, **`trust_status = 'self_asserted'`**. It will **not** surface in
> the default feed and its polls won't materialize until the DAO sanctions it (§3).

---

## 3. Sanctioning — the endorse step (governance proposal) **[required for polls to show]**

A vault post of the DAO's **complete** sanctioned read-only-navigator set under
`daoships.dao.navigators`. Canonical / last-write-wins: re-list everything still endorsed; an omitted
address is de-sanctioned; `[]` clears all.

### 3.1 Add the tag

`src/types/poster.ts` — add to `POSTER_TAGS`:
```ts
DAO_NAVIGATORS: 'daoships.dao.navigators',
```

### 3.2 Build the post calldata (`src/services/core/PosterService.ts`)

Add a convenience builder alongside the other typed tag methods. It does **not** post directly — a
vault post must execute from the avatar, so it's wrapped in a governance proposal:

```ts
buildSanctionNavigatorsContent(daoAddress: string, navigators: { address: string; type?: string }[]) {
  return this.stringify({
    schemaVersion: '1.0',
    daoAddress: daoAddress.toLowerCase(),
    navigators: navigators.map((n) => ({ address: n.address.toLowerCase(), type: n.type })),
  });
}
```

### 3.3 Wrap in a proposal (`src/services/utils/ProposalEncoder.ts` + the NavigatorForm flow)

Encode `Poster.post(content, 'daoships.dao.navigators')` as a single-action proposal (target = Poster,
value = 0), exactly like the `dao.profile`-via-governance path. Surface it in the proposal builder —
e.g. a "Sanction signal navigators" action in `src/components/proposal/forms/NavigatorForm.tsx`
(or a small dedicated form) that pre-fills the **current** sanctioned set + the new address so the
governor can't accidentally drop existing endorsements.

> On execution the indexer flips `trust_status → 'sanctioned'` and **backfills** the navigator's polls.
> To **revoke**, submit a new proposal re-posting the list without that address (or `[]`).

---

## 4. Member flow — the SignalNavigator plugin

`SignalNavigator` currently falls through to `UnknownPlugin`. Build `SignalPlugin` and register it.

### 4.1 Register the plugin (`src/components/navigator/plugins/index.ts`)

```ts
import { SignalPlugin } from './SignalPlugin'
registerNavigatorPlugin('SignalNavigator', SignalPlugin)
```

### 4.2 Live config (`src/hooks/useNavigatorConfig.ts`)

For `navigator_type === 'SignalNavigator'`, read the immutables: `minSharesToCreatePoll`,
`minDuration`, `maxDuration`, `maxStartDelay`, `pollCount`.

### 4.3 Poll list + results (read from the **indexer**, not chain)

Use the indexer (see §5) — `ds_signal_polls` (with the authoritative `tally`) and `ds_signal_votes`.
Compute status client-side (time-derived, never stored):

```ts
function computeSignalPollStatus(p, now = Math.floor(Date.now()/1000)) {
  if (p.cancelled) return 'cancelled'
  if (now < p.voting_starts) return 'pending'
  if (now >= p.voting_ends) return 'ended'        // half-open [voting_starts, voting_ends)
  return 'active'
}
```

### 4.4 Create a poll

> **STATUS: IMPLEMENTED (2026-06-14).** `navigatorService.signalCreatePoll(...)` returns the
> assigned `pollId` (parsed from `PollCreated`); the create form collects the option **labels**
> directly (the label count IS `optionCount`) and runs the two-tx flow in §4.6.

```ts
// startTime = 0 → opens now; else now..now+maxStartDelay. duration in [minDuration, maxDuration].
// Returns the assigned pollId (per-navigator), recovered from the PollCreated event.
const pollId = await navigatorService.signalCreatePoll(navigatorAddress, question, optionCount, startTime, duration)
```
- `question` is an IPFS CID or short text (same convention as proposal/Poster content).
- `optionCount` 2..10 — in the UI this is just the number of option-label rows the creator added.
  Gate the form on `getPriorVotes(creator) >= minSharesToCreatePoll`.

### 4.5 Vote / cancel

```ts
await navigator.vote(pollId, option)     // one vote per address; weight = snapshot SHARE power
await navigator.cancelPoll(pollId)       // creator before start; avatar before end
```

Preflight with the views to disable buttons before a revert: `pollStatus(pollId)`,
`hasVoted(pollId, addr)`, and the member's snapshot weight. Map the custom errors to copy:

| Error | UI message |
|---|---|
| `InsufficientShares` | "You need more voting power to open a poll." |
| `NoVotingPower` | "You had no shares at the snapshot — you can't vote in this poll." |
| `AlreadyVoted` | "You've already voted in this poll." |
| `PollNotStarted` / `PollHasEnded` | "Voting hasn't opened / has closed." |
| `PollIsCancelled` | "This poll was cancelled." |
| `InvalidOption` | "Pick a valid option." |
| `InvalidOptionCount` / `InvalidDuration` / `InvalidStartTime` | (create-form validation should prevent these) |
| `NotAuthorized` | "Only the creator (before start) or the DAO can cancel." |

> **Voting power is shares only, frozen at poll start.** Loot does not count, and shares acquired after
> `votingStarts` carry no weight. Show the snapshot timestamp so members understand a 0-weight result.

### 4.6 Label the options (`daoships.signal.poll`) — creator posts directly

The contract stores only `optionCount` — the **option labels** ("Teal/Magenta/Slate"), plus an optional
description and discussion link, live off-chain in a `daoships.signal.poll` Poster post. The headline
stays on-chain in `PollCreated.question`; this post only labels the indices `0..optionCount-1`.

> **⚠️ This is NOT the sanction flow (§3).** The sanction post is from the **vault** and must be wrapped
> in a **governance proposal**. The labels post is from the **poll creator's own wallet, posted DIRECTLY**
> (`poster.post(...)`, no proposal) — the indexer's trust gate is `msg.sender == PollCreated.creator`.
> It is a **second transaction, after `createPoll`** (it needs the assigned `pollId`).

**As implemented:** `signalCreatePoll` (§4.4) returns the `pollId`, then `PosterService.postSignalPollLabels`
posts the labels directly from the creator's wallet (a single convenience method, mirroring the existing
direct-post `postMemberProfile` / `postVoteReason`):

```ts
const pollId = await navigatorService.signalCreatePoll(navigatorAddress, question, options.length, startTime, duration)

// Posted directly by the creator wallet — same signer that opened the poll. daoAddress IS daoId here.
await posterService.postSignalPollLabels({
  daoAddress: daoId, navigatorAddress, pollId: Number(pollId),
  options: ['Teal', 'Magenta', 'Slate'],          // length MUST equal optionCount
  description: 'Pick the v2 brand color.',          // optional
  discussionUrl: 'https://forum.mydao.xyz/t/789',   // optional
})
```

The tag lives in `POSTER_TAGS` (`src/types/poster.ts`): `SIGNAL_POLL: 'daoships.signal.poll'`.
`SignalPlugin.tsx` wraps both calls in a small state machine: TX1 → TX2, and if TX2 fails the
recovered `pollId` is kept so the creator can **retry the labels post without recreating the poll**.
The same `postSignalPollLabels` call backs the later "Edit options & details" affordance (TX2 only,
option count locked to the poll's `option_count`). Pre-flight validation lives in
`validateSignalPollLabels` (`src/utils/posterSchemas.ts`), mirroring the indexer's limits.

Rules the form must enforce / surface (the indexer **silently discards** posts that fail these):
- **`options.length` must equal the poll's `optionCount`** — otherwise the post is dropped and the UI
  falls back to numeric labels. Build the options inputs from the count the creator chose at `createPoll`.
- **Only the creator can label their poll**; a post from any other wallet is ignored. Editable
  **last-write-wins** (repost to fix a label/link) — but **only while the poll is `pending`/`active`**;
  the indexer ignores label edits once the poll is `ended`/`cancelled`.

---

## 5. Reading from the indexer (`src/services/indexer/NavigatorIndexerService.ts`)

Add methods + types. Mirror the row shapes in `daoships-indexer/docs/FRONTEND_INTEGRATION.md`
(`SignalPollRow`, `SignalVoteRow`, `NavigatorTrustStatus`) into `src/types/navigator.ts` /
`src/types/trust.ts`.

- `listSignalPolls(daoId)` → `ds_signal_polls` by `dao_id`, order by `voting_starts desc`.
- `getSignalPoll(navAddr, pollId)` → single row; `tally` is the authoritative per-option result
  (`NUMERIC[]` as strings) — **don't** re-sum votes or read chain balances.
- **Option labels** ride on the same `ds_signal_polls` row (§4.6): `options TEXT[]`, `description`,
  `discussion_url`. `options` is **null** until the creator's labels post is indexed — always render
  with a numeric fallback: `optionLabel(poll, i) = poll.options?.[i] ?? \`Option ${i + 1}\``. Add these
  fields to `SignalPollRow` in `src/types/navigator.ts`. All four label strings are creator-authored —
  escape them (see `daoships-indexer/docs/FRONTEND_SECURITY_GUIDE.md`).
- `listPollVotes(navAddr, pollId)` / `hasVoted(navAddr, pollId, voter)` → `ds_signal_votes`.
- Realtime: subscribe to `ds_signal_polls` + `ds_signal_votes` (filter `dao_id`); on a vote, re-read
  the poll for the recomputed `tally`. Reuse the `useRealtime*` hook pattern.

`useNavigators.ts` / `NavigatorIndexerService` navigator reads must now carry `trust_status` and
`permission_ever_granted` (the indexer added these columns).

---

## 6. Trust-aware display (mandatory)

A self-asserted SignalNavigator is indistinguishable on-chain from a sanctioned one — `trust_status`
is the only guard. **Default to the safe view.**

| `trust_status` | Default UI |
|---|---|
| `sanctioned` | Show navigator + polls normally |
| `self_asserted` | Behind a "show unverified" toggle / "unverified" badge; offer the DAO a "Sanction" CTA (§3) |
| `unsanctioned` | Hide (was revoked) |
| `fabricated` | Never show |

Put this in `src/types/trust.ts` + the navigator list/card components (`NavigatorList.tsx`,
`NavigatorCard.tsx`), and default the poll feed to `sanctioned`-only.

---

## 7. Checklist

- [ ] `navigatorCatalog.ts`: SignalNavigator → `shipped` (and TimelockNavigator → `shipped`, separate effort).
- [ ] `src/config/abi/SignalNavigator.json` + `.bytecode.ts`.
- [ ] `navigatorValidation.ts` branch (duration/window bounds) + `NavigatorDeployService` case (7 args, **no registration**).
- [ ] `POSTER_TAGS.DAO_NAVIGATORS`; `PosterService` content builder; proposal-encoded **sanction** flow in the proposal builder (pre-fill current set).
- [ ] `SignalPlugin.tsx` (poll list / create / vote / cancel / results) + register in `plugins/index.ts`.
- [ ] **Option labels** (§4.6): `POSTER_TAGS.SIGNAL_POLL` + `buildSignalPollLabelsContent`; post **directly from the creator wallet** after `createPoll` (NOT a proposal); options-input count bound to `optionCount`; allow last-write-wins edits while `pending`/`active`. Render `options[i] ?? "Option i+1"`; add `options`/`description`/`discussion_url` to `SignalPollRow` and escape them.
- [ ] `useNavigatorConfig` reads for the signal immutables.
- [ ] `NavigatorIndexerService` methods + `SignalPollRow`/`SignalVoteRow`/`NavigatorTrustStatus` types + realtime.
- [ ] Trust-aware display: `trust_status` on navigator rows; default `sanctioned`-only; unverified toggle; "Sanction" CTA.
- [ ] Disambiguate the existing **Signal proposal** form (rename to `SignalProposalForm`) so it isn't confused with navigator polls.
- [ ] **Exclude read-only navigators from the launch wizard** (`NavigatorsStep`) — filter by `permission > 0` / a `launchEligible:false` catalog flag. Signal is post-launch-only (the indexer drops a pre-DAO read-only deploy); offer it only from navigator-management.

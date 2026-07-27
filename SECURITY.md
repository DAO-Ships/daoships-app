# Security Policy

## Reporting a vulnerability

Use **GitHub private vulnerability reporting**: the
[Security tab](https://github.com/DAO-Ships/daoships-app/security/advisories/new) on this
repository → *Report a vulnerability*. That opens a private thread visible only to maintainers.

**Do not open a public issue for a security report.** DAO Ships governs real treasuries on Quai
mainnet; a public issue is a disclosure.

If the vulnerability is in the contracts, report it on
[daoships-contracts](https://github.com/DAO-Ships/daoships-contracts/security/advisories/new)
instead. If it is in the Quai Vault, report it to [Quai Vault](https://quaivault.org) — the vault
implementation is deployed by that project and is not maintained here.

Expect an acknowledgement within a few days. This is a small project; please allow reasonable
time to ship a fix before disclosing publicly.

## Reporting abuse

Abuse is not the same as a vulnerability, and it does not need to be private. Scam DAOs,
navigators built to drain onboarding tribute, and proposal text crafted to attack readers can all
be reported as a normal [issue](https://github.com/DAO-Ships/daoships-app/issues).

Note what this project can and cannot do about it. There is no admin key, no pause switch, and no
ability to alter or remove anything on-chain. What can change is what the interface surfaces —
warnings, trust labels, and what `Explore` lists.

## Scope

**In scope:** this web client — XSS and injection in rendered indexer content, transaction
construction that produces something other than what the interface described, address or
chain-ID handling that could send funds to the wrong place, deep-link parameters that alter a
proposal's meaning, dependency and build-pipeline compromise.

**Out of scope:** the contracts (report on `daoships-contracts`), the Quai Vault, Quai Network
itself, the Supabase publishable key (it is public by design — the database is read-only at the
RLS layer and writes return `401`), and anything requiring a user to paste attacker-supplied code
into their own console.

## Threat model

The following are known, structural, and inform how the client is built. Reports that sharpen any
of them are welcome; reports that restate them are not findings.

### 1. A malicious DAO poisoning an automated reader

`submitProposal` is `external payable` with **no membership check**, and `proposalOffering` is
commonly `0`. Any funded address can therefore write arbitrary text into `ds_proposals.details`.
The same holds for `ds_records.content_json`, `ds_daos.name` / `description`, `ds_navigators.name`,
and signal-poll labels — `Poster` tags are permissionless.

For a human reader that is a phishing and XSS surface, handled by escaping and trust-level
labelling. For an AI agent it is a **prompt-injection surface**: the first field an agent reads
about a proposal is attacker-controlled, and it lands directly in the model's context. This is why
[the agent documentation](https://daoships.org/docs/developers/agents) says to treat every indexer
column as untrusted input rather than as instructions, and why no signing tool is shipped that
ingests this data — a key in a process that reads `ds_proposals.details` is a
prompt-injection-to-signature pipeline.

### 2. A malicious agent griefing a DAO

Nothing gates automation, and nothing should — the chain is open. The realistic vectors are
proposal spam when `proposalOffering` is `0`, and processing proposals at moments chosen to
manipulate the retention veto. Mitigation is governance configuration, not access control: a
non-zero offering and a considered `minRetentionPercent`.

### 3. Compromised distribution

The client is a static bundle. A compromised build pipeline, dependency, or hosting account could
serve a page that constructs different transactions than the source implies. Contract addresses
ship in `src/config/deployments.ts` and are verified against on-chain bytecode at wallet-connect;
that check exists to catch a wrong-network or substituted address set and should not be weakened.
Addresses can also be re-derived on-chain from a single launcher address — see
[Contracts & addresses](https://daoships.org/docs/developers/contracts).

### 4. Deep links weaponised against humans

Proposal deep links carry structured parameters. A link that renders a familiar-looking summary
while encoding different calldata attacks the reader, not the contract. Values that determine what
a transaction *does* are not taken from the URL, and calldata is decoded and displayed from the
bytes themselves rather than from any accompanying description. Treat any regression here as a
security bug.

## What this project never does

No private key is ever held, requested, or transmitted. No transaction is relayed or co-signed.
No server holds user funds or credentials. Anyone offering to do any of these "for DAO Ships" is
not connected to this project.

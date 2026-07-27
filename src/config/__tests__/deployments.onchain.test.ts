// ═══════════════════════════════════════════════════════════════════════════
// Deployment gates — the checks that need the live chain.
//
// deployments.test.ts covers the offline invariants (shape, checksums, shard).
// Those cannot tell you the one thing that actually matters: whether the table
// describes the deployment that is currently live.
//
// It has been wrong. Orchard has had at least four complete DAOShips
// deployments, each internally consistent, all sharing the Quai Vault
// infrastructure — so a retired set passes every offline check, holds real
// bytecode, and looks two-thirds correct against any other source. The testnet
// column held a retired deployment while production ran on env overrides, and
// nothing in the repo could tell.
//
// These gates close that: an address table is only correct if the chain agrees.
//
// OPT-IN. Network-dependent, so it does not run in the default suite:
//     npm run test:deployments
// Run it after any redeploy, and in CI on a schedule or on push to main —
// not on every commit, where an RPC blip would read as a code failure.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest'
import { quais } from 'quais'
import { DEPLOYMENTS, SUPPORTED_CHAIN_IDS, type ChainDeployment } from '../deployments'

const ENABLED = !!process.env.CHECK_DEPLOYMENTS
const TIMEOUT = 60_000

/** Raw JSON-RPC. quais' provider adds shard handling we do not want to test through. */
async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await res.json() as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(`${method} failed: ${body.error.message ?? JSON.stringify(body.error)}`)
  return body.result
}

const getCode = (url: string, address: string) =>
  rpc(url, 'quai_getCode', [address, 'latest']) as Promise<string>

/** Read an address-returning view function. Selector-encoded to avoid an ABI import. */
async function readAddress(url: string, to: string, signature: string): Promise<string> {
  const selector = quais.id(signature).slice(0, 10)
  const result = await rpc(url, 'quai_call', [{ to, data: selector }, 'latest']) as string
  if (!result || result.length < 42) throw new Error(`${signature} on ${to} returned ${result}`)
  return quais.getAddress('0x' + result.slice(-40))
}

describe.skipIf(!ENABLED)('deployment gates (live chain)', () => {
  beforeAll(() => {
    if (!ENABLED) return
    console.info('[gates] checking', SUPPORTED_CHAIN_IDS.join(', '))
  })

  describe.each(SUPPORTED_CHAIN_IDS)('chain %i', (chainId) => {
    const d: ChainDeployment = DEPLOYMENTS[chainId]

    it('RPC reports the chain ID this entry claims', async () => {
      const hex = await rpc(d.rpcUrl, 'quai_chainId', []) as string
      expect(parseInt(hex, 16), `${d.rpcUrl} should be chain ${chainId}`).toBe(chainId)
    }, TIMEOUT)

    it('every configured address holds bytecode', async () => {
      const entries = Object.entries(d.contracts)
      const codes = await Promise.all(entries.map(([, a]) => getCode(d.rpcUrl, a)))

      const empty = entries
        .map(([name, address], i) => ({ name, address, code: codes[i] }))
        .filter((c) => !c.code || c.code === '0x')

      expect(
        empty,
        `no bytecode at: ${empty.map((c) => `${c.name}=${c.address}`).join(', ')}`,
      ).toEqual([])
    }, TIMEOUT)

    // The core gate. Seven of the nine addresses are reachable from
    // DAOShipAndVaultLauncher, so the table is checkable against the chain rather
    // than against another file that may describe a different deployment.
    it('derives the same set the table claims, walking from the launcher', async () => {
      const root = d.contracts.DAOSHIP_AND_VAULT_LAUNCHER

      const [daoShipLauncher, quaiVaultFactory, multisendCallOnly] = await Promise.all([
        readAddress(d.rpcUrl, root, 'daoShipLauncher()'),
        readAddress(d.rpcUrl, root, 'quaiVaultFactory()'),
        readAddress(d.rpcUrl, root, 'multisendCallOnly()'),
      ])

      expect(daoShipLauncher, 'DAOSHIP_LAUNCHER').toBe(d.contracts.DAOSHIP_LAUNCHER)
      expect(quaiVaultFactory, 'QUAIVAULT_FACTORY').toBe(d.contracts.QUAIVAULT_FACTORY)
      expect(multisendCallOnly, 'MULTISEND_CALL_ONLY').toBe(d.contracts.MULTISEND_CALL_ONLY)

      const [daoShipSingleton, sharesSingleton, lootSingleton] = await Promise.all([
        readAddress(d.rpcUrl, daoShipLauncher, 'daoShipSingleton()'),
        readAddress(d.rpcUrl, daoShipLauncher, 'sharesSingleton()'),
        readAddress(d.rpcUrl, daoShipLauncher, 'lootSingleton()'),
      ])

      expect(daoShipSingleton, 'DAOSHIP_SINGLETON').toBe(d.contracts.DAOSHIP_SINGLETON)
      expect(sharesSingleton, 'SHARES_SINGLETON').toBe(d.contracts.SHARES_SINGLETON)
      expect(lootSingleton, 'LOOT_SINGLETON').toBe(d.contracts.LOOT_SINGLETON)

      // Owned by the external Quai Vault project — it can change with no commit in
      // any DAO Ships repo, so this is the value most likely to drift silently.
      const vaultSingleton = await readAddress(d.rpcUrl, quaiVaultFactory, 'implementation()')
      expect(vaultSingleton, 'VAULT_SINGLETON').toBe(d.contracts.VAULT_SINGLETON)
    }, TIMEOUT)

    // Poster has no back-reference from the graph, so it cannot be derived — only
    // confirmed to be a live contract rather than an EOA or an empty address.
    it('Poster is a deployed contract', async () => {
      const code = await getCode(d.rpcUrl, d.contracts.POSTER)
      expect(code.length, `POSTER ${d.contracts.POSTER} has no code`).toBeGreaterThan(2)
    }, TIMEOUT)

    // ── The liveness gate ──────────────────────────────────────────────────
    // Everything above proves the table is INTERNALLY CONSISTENT. That is not
    // enough, and assuming it was is how the retired testnet set survived: each
    // Orchard deployment derives cleanly from its own launcher, so a retired one
    // passes the walk, holds bytecode, and reports the right chain ID.
    //
    // What separates live from retired is whether the deployment has DAOs in the
    // indexer schema this chain is bound to. Every DAOShip is an ERC-1167 clone,
    // and a clone's runtime code embeds its implementation — so a DAO the app can
    // actually read is proof of which singleton produced it.
    it('the indexer holds DAOs built from this deployment', async () => {
      const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
      const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
      if (!url || !key) {
        console.warn('[gates] skipping liveness check: no Supabase credentials in env')
        return
      }

      const res = await fetch(
        `${url}/rest/v1/ds_daos?select=id&limit=5`,
        { headers: { apikey: key, 'Accept-Profile': d.supabaseSchema } },
      )
      const daos = await res.json() as { id: string }[]

      if (!Array.isArray(daos) || daos.length === 0) {
        // A brand-new deployment legitimately has none. Say so rather than
        // asserting on an empty set, which would pass vacuously.
        console.warn(`[gates] ${d.supabaseSchema} has no DAOs yet — liveness unproven`)
        return
      }

      const code = await getCode(d.rpcUrl, quais.getAddress(daos[0].id))
      // ERC-1167 runtime: 363d3d373d3d3d363d73 <20-byte impl> 5af43d82803e903d91602b57fd5bf3
      const marker = code.toLowerCase().indexOf('363d3d373d3d3d363d73')
      expect(marker, `${daos[0].id} is not an ERC-1167 clone`).toBeGreaterThanOrEqual(0)

      const impl = quais.getAddress('0x' + code.slice(marker + 20, marker + 60))
      expect(
        impl,
        `DAOs in the "${d.supabaseSchema}" schema are clones of ${impl}, but DAOSHIP_SINGLETON `
        + `is ${d.contracts.DAOSHIP_SINGLETON}. This column describes a deployment the indexer `
        + 'has never seen — almost certainly a retired one.',
      ).toBe(d.contracts.DAOSHIP_SINGLETON)
    }, TIMEOUT)
  })

  it('mainnet and testnet do not share a DAOShips-owned contract', async () => {
    // The Quai Vault trio is legitimately shared within a network but must never
    // match across networks — that would mean one column is pointing at the other
    // chain's deployment.
    const main = DEPLOYMENTS[9].contracts
    const orch = DEPLOYMENTS[15000].contracts
    for (const key of Object.keys(main) as (keyof typeof main)[]) {
      expect(main[key].toLowerCase(), `${key} is identical across chains`)
        .not.toBe(orch[key].toLowerCase())
    }
  })
})

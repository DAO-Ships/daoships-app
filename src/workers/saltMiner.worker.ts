// ═══════════════════════════════════════════════════════════════════════════
// Salt Miner Web Worker
// ═══════════════════════════════════════════════════════════════════════════
//
// CPU-intensive CREATE2 salt mining for Quai Network Cyprus1 shard.
// Runs off the main thread to keep the UI responsive.
//
// Cyprus1 addresses must start with `0x00` and pass quais.isQuaiAddress().
//
// Reference: daoships-contracts/scripts/launch-dao.ts
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'

const MAX_ATTEMPTS = 100_000
const CYPRUS1_PREFIX = '0x00'

// ── Message Types ─────────────────────────────────────────────────────────

interface MineRequest {
  type: 'mine'
  contracts: Array<{
    name: string // 'vault' | 'shares' | 'loot' | 'daoShip'
    factoryAddress: string
    senderAddress: string
    initCodeHash: string
    /**
     * Salt packing type:
     * - 'bytes32': keccak256(abi.encodePacked(sender, salt))          — used by QuaiVaultFactory
     * - 'uint256': keccak256(abi.encodePacked(sender, uint256(salt))) — used by DAOShipLauncher
     */
    saltPackingType: 'bytes32' | 'uint256'
  }>
}

interface CancelRequest {
  type: 'cancel'
}

type WorkerMessage = MineRequest | CancelRequest

let cancelled = false

// ── Helpers ───────────────────────────────────────────────────────────────

function randomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return arr
}

function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Core Mining Function ──────────────────────────────────────────────────

function mineSalt(
  factoryAddress: string,
  senderAddress: string,
  initCodeHash: string,
  contractName: string,
  saltPackingType: 'bytes32' | 'uint256'
): { salt: string; address: string } {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (cancelled) throw new Error('Mining cancelled')

    // 1. Generate random 32-byte salt
    const userSaltBytes = randomBytes(32)
    const userSalt = bytesToHex(userSaltBytes)

    // 2. Compute full salt using the correct packing type
    //    - QuaiVaultFactory:  keccak256(abi.encodePacked(address, bytes32))
    //    - DAOShipLauncher:   keccak256(abi.encodePacked(address, uint256))
    let fullSalt: string
    if (saltPackingType === 'bytes32') {
      fullSalt = quais.keccak256(
        quais.solidityPacked(['address', 'bytes32'], [senderAddress, userSalt])
      )
    } else {
      const userSaltBigInt = BigInt(userSalt)
      fullSalt = quais.keccak256(
        quais.solidityPacked(['address', 'uint256'], [senderAddress, userSaltBigInt])
      )
    }

    // 3. Predict CREATE2 address
    const predicted = quais.getCreate2Address(factoryAddress, fullSalt, initCodeHash)

    // 4. Check Cyprus1 validity (prefix + Quai address check)
    if (predicted.toLowerCase().startsWith(CYPRUS1_PREFIX) && quais.isQuaiAddress(predicted)) {
      return { salt: userSalt, address: predicted }
    }

    // 5. Report progress every 1000 attempts
    if (i % 1000 === 0) {
      self.postMessage({ type: 'progress', contract: contractName, attempt: i })
    }
  }

  throw new Error(`Salt mining failed for ${contractName}: max attempts (${MAX_ATTEMPTS}) exceeded`)
}

// ── Message Handler ───────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  if (msg.type === 'cancel') {
    cancelled = true
    return
  }

  if (msg.type === 'mine') {
    cancelled = false

    for (let i = 0; i < msg.contracts.length; i++) {
      if (cancelled) {
        self.postMessage({ type: 'error', message: 'Mining cancelled' })
        return
      }

      const contract = msg.contracts[i]

      try {
        self.postMessage({
          type: 'progress',
          contract: contract.name,
          attempt: 0,
          contractIndex: i,
          totalContracts: msg.contracts.length,
        })

        const result = mineSalt(
          contract.factoryAddress,
          contract.senderAddress,
          contract.initCodeHash,
          contract.name,
          contract.saltPackingType
        )

        self.postMessage({
          type: 'result',
          contract: contract.name,
          salt: result.salt,
          address: result.address,
          contractIndex: i,
          totalContracts: msg.contracts.length,
        })
      } catch (e: any) {
        self.postMessage({ type: 'error', message: e.message })
        return
      }
    }

    self.postMessage({ type: 'complete' })
  }
}

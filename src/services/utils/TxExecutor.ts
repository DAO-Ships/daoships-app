// ═══════════════════════════════════════════════════════════════════════════
// TxExecutor — the one write path
// ───────────────────────────────────────────────────────────────────────────
// Every on-chain write in the app repeated the same shape:
//   estimateGasOrThrow → send → await tx.wait()
// with an UNTIMED wait and no durable record of the hash before the await. A
// dropped receipt (lost connection, tab reload, wallet "speed up") then left the
// client with no evidence a transaction was ever sent while the chain had executed
// it. This module is that shape, once:
//
//   1. The hash is recorded (TxTracker.recordTx) the instant it is known and
//      BEFORE the receipt is awaited — the durability the audit assumed existed.
//   2. The wait is bounded. On timeout we throw TxPendingTimeout (carrying the
//      hash) rather than hanging — and DO NOT clear the record, so recoverTx can
//      reconcile it. A timeout is "still confirming", never "failed".
//   3. A reverted-status receipt throws TxReverted instead of silently passing
//      (DaoService writes previously ignored receipt.status entirely).
//
// Two layers: confirmTx for an already-sent tx (reused by multi-step flows like
// approve→pay), and executeWrite for the common estimate→send→confirm case.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import { estimateGasOrThrow } from './GasEstimator'
import { recordTx, clearTx } from './TxTracker'

/** Default ceiling on how long we block the UI waiting for a receipt. */
export const DEFAULT_TX_TIMEOUT_MS = 90_000

/**
 * The receipt did not arrive within the timeout. The transaction was broadcast and
 * MAY still confirm — the hash is recorded for recovery. Callers should surface a
 * "still confirming" state, never a failure.
 */
export class TxPendingTimeout extends Error {
  constructor(readonly hash: string, timeoutMs: number) {
    super(`Transaction ${hash} not confirmed within ${timeoutMs}ms — it may still be pending.`)
    this.name = 'TxPendingTimeout'
  }
}

/** The transaction confirmed with a reverted status (receipt.status !== 1). */
export class TxReverted extends Error {
  constructor(readonly hash: string, label: string) {
    super(`${label} reverted on-chain (${hash}).`)
    this.name = 'TxReverted'
  }
}

interface SentTx {
  hash: string
  wait: () => Promise<quais.TransactionReceipt | null>
}

/**
 * Await a receipt, but never longer than `timeoutMs`. On timeout, throw
 * TxPendingTimeout — the losing `wait()` promise is still handled, so a late
 * revert/resolve does not surface as an unhandled rejection.
 */
export async function waitForReceipt(
  tx: SentTx,
  timeoutMs: number,
): Promise<quais.TransactionReceipt | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new TxPendingTimeout(tx.hash, timeoutMs))
    }, timeoutMs)

    tx.wait().then(
      (receipt) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(receipt)
      },
      (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

interface ConfirmOptions {
  /** Human-readable operation name, used in error messages. */
  label: string
  /** TxTracker step id. When set, the hash is durably recorded before the await. */
  step?: string
  timeoutMs?: number
  /** Address the tx is expected to deploy (CREATE2), for the recovery probe. */
  expectedAddress?: string
}

/**
 * Record → bounded-wait → status-check → clear, for an already-sent transaction.
 * Reused directly by multi-step flows (approve→pay) that send more than once.
 */
export async function confirmTx(
  tx: SentTx,
  opts: ConfirmOptions,
): Promise<quais.TransactionReceipt> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TX_TIMEOUT_MS

  if (opts.step) {
    // Record BEFORE the await — the entire point. chainId may be null very early;
    // recordTx tolerates that and it is still useful for the recovery prompt.
    recordTx({
      step: opts.step,
      hash: tx.hash,
      chainId: baseService.getChainId() ?? 0,
      expectedAddress: opts.expectedAddress,
    })
  }

  const receipt = await waitForReceipt(tx, timeoutMs)
  // Reached only on a confirmed (non-timeout) receipt — safe to forget the record.
  if (opts.step) clearTx(opts.step)

  if (!receipt || receipt.status !== 1) {
    throw new TxReverted(tx.hash, opts.label)
  }
  return receipt
}

interface ExecuteWriteParams {
  contract: quais.Contract
  /** Method name or full signature (e.g. 'submitVote' or 'onboard(bytes32[])'). */
  method: string
  args: unknown[]
  /** Human-readable operation name for gas estimation + error messages. */
  label: string
  /** TxTracker step id; enables record-before-await durability. */
  step?: string
  /** Transaction overrides (e.g. { value }). Merged with any computed gasLimit. */
  overrides?: Record<string, unknown>
  /** Multiply the gas estimate by this/100 as the gasLimit (e.g. 150n = +50% headroom). */
  gasMultiplier?: bigint
  timeoutMs?: number
  expectedAddress?: string
}

/**
 * The common single-send write: estimate → send → confirm.
 *
 * Gas is estimated via estimateGasOrThrow (which decodes contract errors and, on
 * Pelagus's data-less reverts, returns undefined so the wallet simulates at signing).
 * When a gasMultiplier is given and an estimate came back, it is applied as gasLimit.
 * Overrides are only appended when non-empty — quais-alpha throws "no matching
 * fragment" on a trailing undefined/null override argument.
 */
export async function executeWrite(
  p: ExecuteWriteParams,
): Promise<quais.TransactionReceipt> {
  const estimateOverrides = p.overrides && Object.keys(p.overrides).length > 0 ? p.overrides : undefined
  const gasEstimate = await estimateGasOrThrow(p.contract, p.method, p.args, p.label, estimateOverrides)

  const overrides: Record<string, unknown> = { ...(p.overrides ?? {}) }
  if (p.gasMultiplier && gasEstimate !== undefined) {
    overrides.gasLimit = (gasEstimate * p.gasMultiplier) / 100n
  }
  const hasOverrides = Object.keys(overrides).length > 0

  const method = (p.contract as unknown as Record<string, (...a: unknown[]) => Promise<SentTx>>)[p.method]
  const tx = hasOverrides ? await method(...p.args, overrides) : await method(...p.args)

  return confirmTx(tx, {
    label: p.label,
    step: p.step,
    timeoutMs: p.timeoutMs,
    expectedAddress: p.expectedAddress,
  })
}

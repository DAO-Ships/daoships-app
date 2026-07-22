// ═══════════════════════════════════════════════════════════════════════════
// TxTracker — durable record of in-flight transactions
// ═══════════════════════════════════════════════════════════════════════════
//
// Nothing in the app recorded a transaction hash BEFORE awaiting its receipt, so a
// broken tx.wait() — dropped connection, tab reload, wallet "speed up" changing the
// hash — left the client with no evidence a transaction had ever been sent, while
// the chain had already executed it.
//
// The worst case is the launch pipeline: a lost receipt leaves launchResult null
// while the DAO is deployed, and both "Retry this step" and "Resume" re-broadcast
// the SAME CREATE2 salts, which must revert on collision. Only "Start Fresh"
// proceeds — mining new salts and paying for a second full launch.
//
// Record first, await second. On resume, re-check the recorded hash before sending
// anything new.
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'

const STORAGE_KEY = 'daoships-inflight-tx'

/** How long a recorded attempt stays interesting. Beyond this it is almost certainly stale. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface TrackedTx {
  /** Caller-defined step identifier, e.g. 'launch' or 'navigator:erc20tribute'. */
  step: string
  hash: string
  chainId: number
  /** Epoch ms when the hash was recorded (before the receipt was awaited). */
  recordedAt: number
  /** Optional address the transaction was expected to deploy, for a getCode probe. */
  expectedAddress?: string
}

type Store = Record<string, TrackedTx>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Store = {}
    const now = Date.now()
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      const v = value as Partial<TrackedTx>
      if (typeof v?.hash !== 'string' || typeof v?.step !== 'string') continue
      if (typeof v?.recordedAt !== 'number' || now - v.recordedAt > MAX_AGE_MS) continue
      out[key] = v as TrackedTx
    }
    return out
  } catch {
    return {}
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage full or unavailable — tracking is best-effort and must never block a tx.
  }
}

/**
 * Record a transaction hash. Call this the moment the hash is known and BEFORE
 * awaiting the receipt — that ordering is the entire point.
 */
export function recordTx(tx: Omit<TrackedTx, 'recordedAt'>): void {
  const store = readStore()
  store[tx.step] = { ...tx, recordedAt: Date.now() }
  writeStore(store)
}

/** Forget a step once its outcome is known and persisted elsewhere. */
export function clearTx(step: string): void {
  const store = readStore()
  delete store[step]
  writeStore(store)
}

/** The recorded attempt for a step, if any. */
export function getTrackedTx(step: string): TrackedTx | null {
  return readStore()[step] ?? null
}

/** Every recorded attempt (for a "you have unfinished work" prompt). */
export function listTrackedTxs(): TrackedTx[] {
  return Object.values(readStore()).sort((a, b) => b.recordedAt - a.recordedAt)
}

export type RecoveryOutcome =
  | { status: 'none' }
  | { status: 'pending'; hash: string }
  | { status: 'succeeded'; hash: string; receipt: quais.TransactionReceipt }
  | { status: 'reverted'; hash: string; receipt: quais.TransactionReceipt }
  | { status: 'unknown'; hash: string; reason: string }

/**
 * Re-check a recorded attempt before sending a replacement.
 *
 * `unknown` is deliberately distinct from `none`: it means we could not determine the
 * outcome, and the caller must NOT assume the transaction never happened. Re-sending on
 * `unknown` is how a duplicate proposal, a duplicate navigator deploy, or a
 * guaranteed-to-revert CREATE2 collision happens.
 */
export async function recoverTx(step: string): Promise<RecoveryOutcome> {
  const tracked = getTrackedTx(step)
  if (!tracked) return { status: 'none' }

  try {
    const receipt = await baseService.getProvider().getTransactionReceipt(tracked.hash)
    if (!receipt) return { status: 'pending', hash: tracked.hash }
    return receipt.status === 1
      ? { status: 'succeeded', hash: tracked.hash, receipt }
      : { status: 'reverted', hash: tracked.hash, receipt }
  } catch (err) {
    return {
      status: 'unknown',
      hash: tracked.hash,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Does `address` already have bytecode?
 *
 * For CREATE2 deployments the address is known before sending, so this answers
 * "did my earlier attempt actually land?" without needing the receipt at all.
 * verifyContractDeployments already had a working quai_getCode helper that the
 * launch flow never called.
 */
export async function hasCodeAt(address: string): Promise<boolean | null> {
  try {
    const code = await baseService.getProvider().getCode(quais.getAddress(address))
    return Boolean(code) && code !== '0x' && code.length > 2
  } catch {
    // Transport failure — unknown, NOT "no code". Returning false here would send a
    // colliding CREATE2 deploy.
    return null
  }
}

/**
 * Wrap a send so the hash is durably recorded before the receipt is awaited.
 *
 * `send` must return the sent transaction; the receipt wait happens here.
 */
export async function trackedSend<T extends { hash: string; wait: () => Promise<unknown> }>(
  step: string,
  chainId: number,
  send: () => Promise<T>,
  options?: { expectedAddress?: string },
): Promise<T> {
  const tx = await send()
  recordTx({ step, hash: tx.hash, chainId, expectedAddress: options?.expectedAddress })
  await tx.wait()
  clearTx(step)
  return tx
}

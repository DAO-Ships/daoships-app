// ═══════════════════════════════════════════════════════════════════════════
// SignalNavService — SignalNavigator (read-only, non-binding polls)
// ═══════════════════════════════════════════════════════════════════════════

import { quais } from 'quais'
import { baseService } from '../BaseService.ts'
import { confirmTx } from '@/services/utils/TxExecutor'
import SignalNavigatorABI from '@/config/abi/SignalNavigator.json'
import type { SignalNavigatorConfig } from './types'

class SignalNavService {
  /** Read the SignalNavigator's immutable config + current poll count. */
  async getSignalConfig(navigatorAddress: string): Promise<SignalNavigatorConfig> {
    const contract = new quais.Contract(navigatorAddress, SignalNavigatorABI, baseService.getProvider())

    const [minSharesToCreatePoll, minDuration, maxDuration, maxStartDelay, pollCount, navigatorType] =
      await Promise.all([
        contract.minSharesToCreatePoll(),
        contract.minDuration(),
        contract.maxDuration(),
        contract.maxStartDelay(),
        contract.pollCount(),
        contract.navigatorType(),
      ])

    return {
      minSharesToCreatePoll: BigInt(minSharesToCreatePoll),
      minDuration: BigInt(minDuration),
      maxDuration: BigInt(maxDuration),
      maxStartDelay: BigInt(maxStartDelay),
      pollCount: BigInt(pollCount),
      navigatorType: String(navigatorType),
    }
  }

  /** Has `voter` already voted on a poll? (Authoritative on-chain read.) */
  async signalHasVoted(navigatorAddress: string, pollId: bigint, voter: string): Promise<boolean> {
    const contract = new quais.Contract(navigatorAddress, SignalNavigatorABI, baseService.getProvider())
    return Boolean(await contract.hasVoted(pollId, voter))
  }

  /** Poll status enum: 0=Pending, 1=Active, 2=Ended, 3=Cancelled. */
  async signalPollStatus(navigatorAddress: string, pollId: bigint): Promise<number> {
    const contract = new quais.Contract(navigatorAddress, SignalNavigatorABI, baseService.getProvider())
    return Number(await contract.pollStatus(pollId))
  }

  /**
   * Create a poll. `startTime` is an absolute unix timestamp (0 = open now; else
   * now..now+maxStartDelay). `duration` is in seconds, within [minDuration, maxDuration].
   * `optionCount` must be 2..10.
   */
  async signalCreatePoll(
    navigatorAddress: string,
    question: string,
    optionCount: number,
    startTime: bigint,
    duration: bigint,
  ): Promise<bigint> {
    const contract = new quais.Contract(navigatorAddress, SignalNavigatorABI, baseService.requireSigner())
    const tx = await contract.createPoll(question, optionCount, startTime, duration)
    const receipt = await confirmTx(tx, { label: 'SignalNavigator.createPoll' })

    // Recover the assigned pollId (per-navigator, starts at 0) from PollCreated so the caller
    // can post the daoships.signal.poll option labels in the required second transaction.
    const iface = new quais.Interface(SignalNavigatorABI)
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
        if (parsed?.name === 'PollCreated') {
          return parsed.args.pollId as bigint
        }
      } catch {
        // Not a PollCreated log — keep scanning.
      }
    }
    throw new Error('SignalNavigator.createPoll succeeded but no PollCreated event was found')
  }

  /** Cast a vote. Weight is the snapshot share power (loot excluded), resolved on-chain. */
  async signalVote(navigatorAddress: string, pollId: bigint, option: number): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, SignalNavigatorABI, baseService.requireSigner())
    const tx = await contract.vote(pollId, option)
    await confirmTx(tx, { label: 'SignalNavigator.vote' })
  }

  /** Cancel a poll (creator before start; avatar before end). */
  async signalCancelPoll(navigatorAddress: string, pollId: bigint): Promise<void> {
    const contract = new quais.Contract(navigatorAddress, SignalNavigatorABI, baseService.requireSigner())
    const tx = await contract.cancelPoll(pollId)
    await confirmTx(tx, { label: 'SignalNavigator.cancelPoll' })
  }
}

export const signalNavService = new SignalNavService()

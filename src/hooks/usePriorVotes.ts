import { useQuery } from '@tanstack/react-query'
import { daoService } from '@/services/DaoService'
import { baseService } from '@/services/core/BaseService'

/**
 * Voting power a member held at a proposal's `votingStarts` snapshot.
 *
 * The contract requires `getPriorVotes(msg.sender, prop.votingStarts) != 0` to accept
 * a vote (DAOShip.submitVote). The client gated only on status/hasVoted/delegation, so
 * every member onboarded MID-VOTE — and every connected wallet holding zero shares —
 * saw an enabled Vote button that reverts at gas estimation.
 *
 * Snapshot power is immutable once voting has started, hence the long staleTime.
 * Returns undefined while unresolved so callers can distinguish "not yet known" from
 * "confirmed zero" and avoid disabling the button on a transient read failure.
 */
export function usePriorVotes(
  daoId: string | undefined,
  memberAddress: string | undefined,
  votingStarts: string | null | undefined,
) {
  const timepoint = votingStarts ? Math.floor(new Date(votingStarts).getTime() / 1000) : undefined

  return useQuery<bigint>({
    queryKey: ['priorVotes', daoId, memberAddress, timepoint],
    queryFn: () => daoService.getPriorVotes(daoId!, memberAddress!, BigInt(timepoint!)),
    // Needs the wallet provider — all RPC goes through it (direct RPC is CORS-blocked).
    enabled: Boolean(daoId && memberAddress && timepoint && baseService.hasProvider()),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

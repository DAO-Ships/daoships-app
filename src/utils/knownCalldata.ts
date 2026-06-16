import { quais } from 'quais'

// ═══════════════════════════════════════════════════════════════════════════
// knownCalldata - decode the actions the app deep-links into the custom-action form
// ───────────────────────────────────────────────────────────────────────────
// Navigator deep-links (vault module wiring + navigator governance) arrive as pre-encoded
// calldata. This decodes them against the known signatures so a proposer can SEE and verify
// exactly what a prefilled transaction does (e.g. "enableModule(0xNavigator…)") instead of a
// raw hex blob. Best-effort: an unrecognized selector returns null and the UI falls back to the
// carried summary + raw calldata. Param-name mismatches are harmless (only the selector matches).
// ═══════════════════════════════════════════════════════════════════════════

const KNOWN_SIGNATURES = [
  // Vault (Zodiac/Safe) module wiring — the budget-navigator enable/disable flow
  'function enableModule(address module)',
  'function disableModule(address prevModule, address module)',
  // BudgetNavigator governance
  'function createBudget(address manager, address token, uint256 allowancePerPeriod, uint256 totalCeiling, uint64 periodLength, uint64 startTime, uint64 endTime)',
  'function cancelBudget(uint256 budgetId)',
  'function updateManager(uint256 budgetId, address newManager)',
  // TimelockNavigator governance
  'function queueChange(bytes governanceConfig)',
  'function cancelChange(uint256 changeId)',
  'function emergencyCancelAll()',
  // VestingNavigator governance
  'function createSchedule(address beneficiary, uint256 totalAmount, uint64 startTime, uint64 cliffDuration, uint64 vestingDuration, bool isLoot)',
  'function revoke(uint256 scheduleId)',
  // SubscriptionNavigator governance
  'function enroll(address member)',
  'function enrollBatch(address[] members)',
  // Shared navigator admin (pause/recover)
  'function pause()',
  'function unpause()',
  'function withdrawStuckETH(address to, uint256 amount)',
  'function withdrawStuckTokens(address token, address to, uint256 amount)',
]

const KNOWN_IFACE = new quais.Interface(KNOWN_SIGNATURES)

export interface DecodedCalldataArg { name: string; type: string; value: string }
export interface DecodedCalldata { name: string; args: DecodedCalldataArg[] }

function formatArg(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return '[' + v.map(formatArg).join(', ') + ']'
  return String(v)
}

/** Best-effort decode of a single action's calldata against the app's known deep-link signatures. */
export function decodeKnownCalldata(data: string | undefined | null): DecodedCalldata | null {
  if (!data || data === '0x' || data.length < 10) return null
  try {
    const parsed = KNOWN_IFACE.parseTransaction({ data })
    if (!parsed) return null
    return {
      name: parsed.name,
      args: parsed.fragment.inputs.map((inp, i) => ({
        name: inp.name || `arg${i}`,
        type: inp.type,
        value: formatArg(parsed.args[i]),
      })),
    }
  } catch {
    return null
  }
}

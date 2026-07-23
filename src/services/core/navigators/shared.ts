// ═══════════════════════════════════════════════════════════════════════════
// Shared navigator ABIs — minimal ERC-20 + EIP-2612 permit probe
// ───────────────────────────────────────────────────────────────────────────
// Used by the tribute/subscription onboard flows (approve/allowance and the
// permit → single-tx onboard path).
// ═══════════════════════════════════════════════════════════════════════════

export const ERC20_MINIMAL_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]

export const ERC20_PERMIT_PROBE_ABI = [
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  // EIP-5267 — canonical source of domain fields when available
  'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)',
  // Fallback if eip712Domain() isn't implemented
  'function version() view returns (string)',
]

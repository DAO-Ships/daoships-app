# SSSES Audit Report — DAOShips Frontend (Round 2)

**Date**: 2026-04-06
**Scope**: Full codebase — services, hooks, config, store, utils, components, pages, types
**Files Reviewed**: 156 files
**Remediation Status**: 31 FIXED, 3 MITIGATED, 2 DEFERRED, 2 ACCEPTED

---

## Overall Assessment

The codebase is **well-architected and security-conscious**. No critical XSS, no `dangerouslySetInnerHTML`, URL inputs use a positive-allowlist scheme, wallet interactions are properly guarded, and the types layer is clean.

---

## Verification Summary

| ID | Severity | Status | Resolution |
|----|----------|--------|------------|
| C-1 | Critical | **FIXED** | ILIKE wildcards escaped with `replace(/[%_\\]/g, '\\$&')` |
| C-2 | Critical | **FIXED** | `quais.getAddress()` added to all 6 contract helpers |
| H-1 | High | **FIXED** | `safeHref()` on AnnouncementBanner URL |
| H-2 | High | **FIXED** | `safeHref()` on ProposalActionSummary announcement URL |
| H-3 | High | **FIXED** | `safeHref()` on ProposalDetail discussion URL |
| H-4 | High | **FIXED** | `safeHref()` on DelegateCard profile links |
| H-5 | High | **FIXED** | Unused `offering` parameter removed from `submitProposal` |
| H-6 | High | **MITIGATED** | `isActive` flag in useWallet effect cleanup discards stale signers; `requireSigner()` throws cleanly during gap |
| H-7 | High | **FIXED** | Health URL defaults to `''` in production (disables checks vs hitting localhost) |
| H-8 | High | **MITIGATED** | Production throws if no project ID; `PLACEHOLDER` only in dev with WC UI hidden |
| H-9 | High | **FIXED** | MAX_NOTIFICATIONS=20 cap + 2s dedup window; uiStore notification slice removed |
| M-1 | Medium | **FIXED** | MultiSend parser bounds check: `dataLength > 1MB || offset + dataLength > bytes.length` |
| M-2 | Medium | **FIXED** | IPFS response body-level byte limit enforced (not just Content-Length header) |
| M-3 | Medium | **FIXED** | Explorer URL built with `new URL()` + `searchParams` |
| M-4 | Medium | **FIXED** | `parseTokenAmount` rejects negative and multi-dot inputs |
| M-5 | Medium | **FIXED** | rAF loop cancelled on unmount via `cancelAnimationFrame` |
| M-6 | Medium | **FIXED** | Module-scoped counter replaced with `crypto.randomUUID()` |
| M-7 | Medium | **FIXED** | `supabase` removed from all 5 realtime hook dependency arrays |
| M-8 | Medium | **FIXED** | `hasAllowlist`, `userAddress`, `allowlist` added to plugin useCallback deps |
| M-9 | Medium | **MITIGATED** | VotingSidebar wrapped with `React.memo` to minimize cost of dual render |
| M-10 | Medium | **FIXED** | TransactionFlow uses props directly, no state duplication |
| M-11 | Medium | **FIXED** | Explore page paginated at 24 DAOs/page with prev/next controls |
| M-12 | Medium | **FIXED** | Dead notification slice removed from uiStore; NotificationContainer rewired to NotificationManager |
| M-13 | Medium | **FIXED** | Dead `addressEq` removed; `addressesEqual` in AddressUtils is canonical |
| M-14 | Medium | **ACCEPTED** | NavigatorCatalog remains 805 lines — succinctness only, no bug risk |
| M-15 | Medium | **FIXED** | Shared `navigatorPermissions.ts` created; 3 files updated to import from it |
| M-16 | Medium | **FIXED** | `extractDaoExpiryConfig()` added to dao.ts; all 4 pages use it |
| M-17 | Medium | **FIXED** | `formatAddress` returns `''` for null/undefined input |
| L-1 | Low | **ACCEPTED** | Intentionally different gateways (Pinata for content, qu.ai for metadata) |
| L-2 | Low | **FIXED** | `isNewerRecord` uses strict `>` instead of `>=` |
| L-3 | Low | **DEFERRED** | CSS in proposalTypes.ts — co-located with type defs by design |
| L-4 | Low | **FIXED** | `useDaos` routed through `daoService.getDaos()` facade |
| L-5 | Low | **FIXED** | SaltMiner `cancel()` calls `cleanup()` immediately |
| L-6 | Low | **FIXED** | `staleTime` added to all polling hooks (5 hooks updated) |
| L-7 | Low | **FIXED** | Wallet store switched from localStorage to sessionStorage |
| L-8 | Low | **FIXED** | `validateContractConfig()` throws in production builds |
| L-9 | Low | **DEFERRED** | RefObject prop pattern — React 18 compatible, address during React 19 upgrade |
| L-10 | Low | **FIXED** | Breadcrumb uses `item.href ?? item.label` as key |

---

## Status Counts

| Status | Count | Description |
|--------|-------|-------------|
| **FIXED** | 31 | Fix verified in source code |
| **MITIGATED** | 3 | Alternative approach adequately addresses the risk |
| **DEFERRED** | 2 | Intentionally postponed (React 19 upgrade, style preference) |
| **ACCEPTED** | 2 | Risk accepted (intentional design, succinctness-only) |
| **Total** | **38** | |

---

## Positive Observations

- No `dangerouslySetInnerHTML` anywhere
- DOMPurify-based HTML sanitization with strict allowlists
- URL positive-allowlist scheme blocking `javascript:`, `data:`, `vbscript:`
- Prototype pollution prevention in JSON content extraction
- USDT-safe ERC-20 approval pattern (allowance reset before set)
- Gas estimation pre-flight with custom error decoding
- Modal accessibility (focus trap, escape, aria-modal, focus restoration)
- Ragequit double-click guard via synchronous ref flag
- Pre-submit config freshness checks on navigator plugins
- Page visibility-aware polling (pauses when tab hidden)
- Supabase client null-safety throughout all indexer services
- Supabase realtime subscriptions for members, proposals, and records
- Launch wizard persistence with Zod schema validation
- `@tanstack/react-virtual` used for member lists
- CSP header, HSTS, X-Frame-Options, Referrer-Policy all configured
- OG meta tags and dynamic page titles for SEO

---

## Remaining Items (Non-Blocking)

1. **M-9** — VotingSidebar is rendered twice (desktop/mobile). Memoized with `React.memo` but both instances still mount. A portal or single-instance approach would eliminate duplicate timers.
2. **M-14** — NavigatorCatalog.tsx is 805 lines. Could be split into sub-components for maintainability.
3. **L-3** — CSS classes in proposalTypes.ts. Style preference, not a defect.
4. **L-9** — RefObject prop pattern in VoteReasons. Will need updating for React 19.

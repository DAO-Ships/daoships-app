# E3 — Render efficiency: plan

Measured against the current code, not inherited from the audit's labels. The audit
grouped four items as "render waste"; one (E3a, duplicate `NotificationContainer`) turned
out to be a visible bug and is already fixed in `4b9a7ae`. The remaining three are ranked
below by **measured** cost, which inverts the audit's ordering.

## Summary

| # | Item | Fires | Cost when it fires | Effort | Verdict |
|---|---|---|---|---|---|
| E3d | `VotingSidebar` mounted twice | **every second** during voting/grace | 2 intervals + 2 subtree re-renders instead of 1 | M | **Do this one** |
| E3c | `usePageVisibility` per consumer | tab focus/blur | ~6-8 listeners + state updates | S | Optional |
| E3b | Whole-store zustand destructures | sidebar toggle, theme change | 2-3 extra component renders | S | Skip |

**Total if all three: ~2 days. Recommended scope: E3d only, ~1 day.**

---

## E3d — `VotingSidebar` renders twice, and so does its 1-second timer

**This is the only E3 item with a recurring cost.**

`ProposalDetail` renders two `VotingSidebar` instances — a desktop one at line 437
(`hidden lg:block`, inside a sticky right column) and a mobile one at line 473
(`lg:hidden order-first`). Both are gated only on `!isTerminal`, so **React mounts both
and CSS hides one**. They are not alternatives; they are duplicates.

Each instance owns a countdown tick:

```ts
const [, setTick] = useState(0)
const isCountdownActive = status === Voting || status === Grace || expiryInFuture
useEffect(() => {
  if (!isCountdownActive) return
  const interval = setInterval(() => setTick((t) => t + 1), 1000)
  return () => clearInterval(interval)
}, [isCountdownActive])
```

So during an active vote there are **two `setInterval`s firing every second**, each
triggering a full re-render of its own sidebar subtree — including `ProposalActions` and
the quorum/progress blocks.

`VotingSidebar` is already `memo()`'d, which does **not** help: the tick is internal
state, so memo cannot prevent the re-render. The comment above the tick reads *"isolated
here so only sidebar re-renders"* — the author explicitly designed for this, and the dual
mount silently doubles the thing they were containing.

### Options

**A. Single instance, CSS-driven placement (recommended).**
Restructure the proposal layout so one `VotingSidebar` lands in the right column at `lg`
and above the content below it, using grid areas or `order` on a single parent rather
than two mount points. One mount, one interval, one subtree.
*Risk:* layout regression at the `lg` breakpoint. Mitigate by screenshotting both
breakpoints before/after.

**B. Hoist the tick out of the component.**
Move the countdown to a shared `useCountdownTick(active)` backed by one module-level
interval that fans out to subscribers. Both mounts stay; only one timer runs.
*Cheaper and lower-risk than A, but leaves the duplicated subtree render.* Halves the
cost rather than removing it.

**C. Render one via `useMediaQuery`.**
Rejected: adds a resize listener, and a JS-driven breakpoint can flash the wrong variant
on first paint — trading a small steady cost for a visible one.

**Recommendation:** A, with B as the fallback if the layout proves fiddly. Either way,
add a test asserting exactly one `VotingSidebar` mount site, matching the guard added for
`NotificationContainer` in `4b9a7ae`.

**Effort:** ~1 day including breakpoint verification.

---

## E3c — `usePageVisibility` registers a listener per consumer

17 call sites (16 hooks + `OngoingPolls`). Each calls
`document.addEventListener('visibilitychange', …)` and holds its own `useState`.

The count is per *mounted consumer*, not per file — on a DAO page perhaps 6-8 are live
(`useDao`, `useProposals`, `useMembers`, `useTreasury`, `useNavigators`, …). On tab
focus/blur that is 6-8 listeners firing and 6-8 state updates where one would do.

**Fix:** a single module-level subscription exposed through a store slice (mirroring the
`providerReady` pattern added in `54dba52`), so every consumer reads one reactive value.
Mechanical; the hook's public signature stays `(): boolean`, so no call site changes.

**Cost of not doing it:** a handful of redundant renders on an event the user triggers by
switching tabs. Genuinely negligible.

**Effort:** ~0.5 day. **Verdict: optional.** Worth folding in if E3d touches this area
anyway; not worth a standalone change.

---

## E3b — Whole-store zustand destructures

Seven sites call `useUiStore()` / `useDaoStore()` / `useWalletStore()` with no selector,
subscribing to the entire store. Measured usage:

| Component | Reads | Re-renders on |
|---|---|---|
| `Header` | `toggleSidebar` (stable fn) | `sidebarOpen` **and** `theme` changes |
| `Home` | `theme` | `sidebarOpen` changes |
| `BottomNav` | `setSidebarOpen` (stable fn) | `sidebarOpen` **and** `theme` changes |
| `Sidebar` | 4 of 4 — legitimate | — |

So two or three components re-render on a sidebar toggle or theme switch that do not
depend on either. `uiStore` holds exactly two pieces of state, both changed only by
direct user action.

**Fix:** selector form — `useUiStore((s) => s.toggleSidebar)`.

**Verdict: skip.** The trigger is user-initiated and infrequent, the affected components
are small, and the change touches seven files to save renders nobody can perceive. Worth
doing only as drive-by cleanup when one of these files is being edited anyway.

---

## Recommended plan

1. **E3d option A** — one `VotingSidebar` mount, one timer. ~1 day. Add the mount-count
   guard test.
2. Stop there.

E3c and E3b are real but sub-perceptual. Given the branch already carries 25 commits of
correctness work, spending two more days on renders nobody can see is worse value than
leaving them documented. Revisit if a profile ever shows the proposal detail page
janking.

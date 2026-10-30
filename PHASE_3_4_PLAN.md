# Phases 3 & 4 — plan

> **Status: Phases 3 and 4 done 2026-10-30.** The plan below is kept as
> written.
>
> **Phase 4** measured the first visit under Vite 8: the four scripts
> `index.html` loads came to 450.6 kB, 151.2 kB gzipped. The largest parts,
> gzipped: react-dom 40.7 kB, framer-motion 35.0, axios 20.8, React Router 13.2,
> the tour code 9.0, tailwind-merge 6.6.
>
> - **One change: the browser's fetch instead of axios.** The first visit is now
>   393.9 kB, 130.8 kB gzipped, 20.4 kB (13%) less. `src/api/client.test.js`
>   pins the client's behaviour and was committed before the swap.
> - **The tour code stays.** At most about 5 kB could leave the first visit, and
>   only by splitting `tours.js` and downloading the tour runner when a tour
>   starts, where a failed download would need handling of its own.
> - **framer-motion stays.** Most pages fade in from opacity 0 (`fadeUp`), so
>   with the animation code loaded separately they would stay blank until it
>   arrived.
> - The rest are fixed costs: React, the router, tailwind-merge and the
>   bundler's runtime.
>
> **Phase 3**, where it went differently:
>
> - **Where the pieces went.** Into `components/`, `hooks/` and `lib/`, not new
>   `tracker/`, `streak/` and `transactions/` folders. The streak pieces carry
>   the card's name (`StreakDayCell`, `StreakBadgeSlot`), so nothing generic
>   sits in the shared folder.
> - **How far it went.** Further than the steps below, to bring every file
>   under 400 lines: TrackerPage 386, StreakCard 365, AddTransactionSheet 369,
>   TransactionsPage 380. Saving an entry, deleting with the undo window, the
>   day-by-day list and the form's sections each became a hook or component of
>   their own. Nothing was removed: every string and piece of text in the old
>   files is still there, and the four files plus the 26 split out of them come
>   to 3,872 lines, up from 3,439.
> - **How it was checked.** Tests went from 766 to 809, and most of the new
>   ones were run against the code before it moved. Every step was also
>   compared with the one before it in the real app rather than the design
>   harness: demo data, phone width, both themes, screenshot and DOM. That
>   included deleting with undo, restoring a streak and saving, with the demo
>   guard lifted in the local test database.
> - **Phase 4's numbers below are from Vite 5.** Vite 8, merged from main
>   afterwards, splits the first load into four JS files, so step 4a measures
>   again from there.

Phases 0–2 are done and committed (through `dc1dd11`). Baseline today, verified
locally:

- Frontend: **766 tests pass**, `npm run lint` clean, `vite build` succeeds.
- The main bundle that loads on every visit is **`index-*.js` 427 kB (142.77 kB gzip)** — this is the "143 kB" the plan names.
- `recharts` is **already** split into its own chunk (`generateCategoricalChart-*.js`, 365 kB / 101 kB gzip) and only loads on Stats/Tracker. Pages are already `React.lazy`-loaded in `App.jsx`.

The same rules from phases 0–2 carry over and are non-negotiable:

- **Behaviour and API responses must not change.** Phase 3 is file-shaped work only.
- **One commit per step**, each independently revertible.
- **Run both suites + the build after every step.** For any screen change, compare headless-Chrome screenshots (`npm run shots`) before and after.
- **Don't change a test to make it pass.** The only allowed edit is an import path when a file moves — and I'll call it out when I do.
- If the code I'm about to move has no test, I write one that pins today's behaviour *first*.

---

## Phase 3 — split the next-largest files

The goal is the same as the MorePage split in phase 2: take a file doing several
jobs and give each job its own file, **without changing a line of behaviour**.
The lever that makes this safe is already in the codebase — `harness.jsx`
imports *named sub-component exports* from pages (`StatsPage`, `TrackerPage`,
`PlanPage` already export their cards). Extracting a sub-component into its own
file and re-exporting it keeps both the harness and the page working, and keeps
the diff to moves + imports.

Current sizes (verified): TransactionsPage 946 · AddTransactionSheet 883 · TrackerPage 830 · StreakCard 780.

Order is chosen so the lowest-risk, best-tested file goes first and each step builds confidence for the next.

### Step 3a — TrackerPage (830 → target < 400)

Lowest risk: `SavedVsSpentCard`, `CategoryCard`, `TermCard` are **already named
exports** consumed by the harness, and `TrackerPage.test.jsx` (425 lines) covers
the page. They just live in the page file today.

- Move `SavedVsSpentCard`, `CategoryCard`, `TermCard` into
  `components/tracker/` (one file each), re-exported from where they are now or
  imported directly.
- Update imports in `harness.jsx` (the one allowed import-path edit — will flag it).
- Leaves `TrackerPage.jsx` as the page shell + data plumbing.
- Verify: `npm test`, `npm run lint`, `npm run build`, and `npm run shots`
  (the `view=tracker` / `reserved=1` / `empty=1` shots exercise these cards).

### Step 3b — StreakCard (780 → target < 400)

`StreakCard.jsx` holds the card plus six private sub-components: `RollingNumber`,
`BadgeSlot`, `ProgressRing`, `Burst`, `BadgesSheet`, `BreakNote`, `DayCell`.
`StreakCard.test.jsx` (381 lines) covers it; none of the sub-components are
exported yet.

- Extract the presentational pieces into `components/streak/` (e.g.
  `ProgressRing.jsx`, `BadgesSheet.jsx`, `StreakCalendar.jsx` for `DayCell`/grid,
  `RollingNumber.jsx`). Keep the data-fetching/decision logic in `StreakCard.jsx`.
- Where a sub-component has branchy logic (`BreakNote`'s copy, `badgeAt`
  progress), if it isn't directly asserted today, **add a focused test first**
  that pins the strings, then move it.
- Verify: full suite + build + `shots` (`view=badges` exercises the badge slot).

### Step 3c — AddTransactionSheet (883 → target < 400)

Higher risk — it owns the add/edit flow, optimistic save, and the repeat/paid-back
logic. It already exports `repeatPlan` (pure, tested). The size is mostly the
`EntryFields`-adjacent form + the tour tips + the save orchestration.

- Pull the pure helpers (`pickEntryTip`, `todayAfter`, repeat-plan glue) into a
  sibling `lib`/module with unit tests pinning current output **before** moving.
- Consider extracting the form body into a presentational child (fields in, one
  `onSubmit` out) so the sheet keeps only orchestration. `EntryFields.jsx`
  already exists as the shared field block — lean on it rather than duplicating.
- This is the step most likely to need a new pinning test first; budget for that.
- Verify: full suite (several add/edit/paid-back suites touch this) + build + shots (`view=keyboard`).

### Step 3d — TransactionsPage (946 → target < 400)

Already exports `deletedMessage` and has private `TransferRow` and
`AccountFilterSheet`. `TransactionsPage.test.jsx` is the largest suite (1508 lines),
so behaviour is well pinned.

- Move `TransferRow` and `AccountFilterSheet` into `components/transactions/`.
- Extract the ledger row (the three-lists amount display already got unified in
  phase 2 via `EntryAmount`) and the filter row into their own components.
- Leaves the page as list state + search/filter + data.
- Verify: full suite + build + shots (`view=ledger`, `ledger-picked`).

**Phase 3 risk: low**, as the plan says — big test suites already pin all four,
and the harness gives a visual diff. The one genuine risk is AddTransactionSheet's
save orchestration (3c); that's why it gets a pinning-test-first pass and isn't last.

---

## Phase 4 — speed (optional, measurement-gated)

The rule here is the plan's own: **measure first, change only if the measurement
shows a real gain.** Findings from the baseline build already sharpen this:

- `recharts` is **already code-split** and off the initial load — so the "animation library is a likely candidate" guess is only half right; recharts is not the problem on first paint.
- The thing that loads on every visit is `index-*.js` at **427 kB (142 kB gzip)**. That is the measurement target.

### Step 4a — measure what's actually in the 143 kB

- Add a one-off bundle analysis (e.g. `rollup-plugin-visualizer` as a dev-only
  build, or `vite build` with `--mode analyze`) to attribute the 427 kB chunk by
  module. Do **not** commit a new permanent dep unless it earns its place; a
  throwaway analysis is enough to decide.
- Expected top contributors to confirm (not assume): `framer-motion`,
  `react-dom`, `react-router-dom`, `lucide-react` (icons), and the **tour
  system** (`src/tour/*` is eagerly loaded via `TourProvider` in `main.jsx`).

### Step 4b — act only on what the numbers justify

Candidate levers, each applied **only if 4a shows a real gain**, each its own
commit with a before/after byte count in the message:

1. **Tour system** — `TourProvider` wraps the whole app in `main.jsx` and pulls
   in `TourRunner`, `SetupQuest`, `tours.js`. If it's a measurable slice, lazy-load
   the runner/quest behind the provider so the tour code loads when a tour
   actually starts, not on first paint. Provider stays eager (cheap); the heavy
   runner becomes a chunk.
2. **lucide-react icons** — confirm imports are already per-icon (named imports,
   which tree-shake) rather than wildcard. If any barrel import slipped in, fix it.
3. **framer-motion** — it's used pervasively, so removing it isn't realistic, but
   check for the `m` + `LazyMotion` pattern if (and only if) the analysis shows
   its full feature bundle is a large, avoidable slice.

### Verification for every Phase 4 step

- `npm run build` and record the `index-*.js` gzip size before/after in the commit.
- Full test suite + `npm run shots` — a lazy-loading change must not alter any
  rendered state or page behaviour.
- If a change doesn't move the number meaningfully, **revert it** — per the plan,
  speed work ships only on demonstrated gain.

**Phase 4 risk: low.** Nothing here changes behaviour or API; the worst case of a
lazy-load split is a one-frame fallback, which the app already handles
(`PageFallback` in `App.jsx`).

---

## Suggested commit sequence

```
refactor(tracker): each donut card in its own file
refactor(streak): split the card's badges, ring and calendar out
test(add): pin the entry-tip and repeat-plan helpers before moving them
refactor(add): form body and helpers out of the add sheet
refactor(transactions): transfer row and account filter in their own files
chore(build): measure the initial bundle            # phase 4, if pursued
perf(tour): load the tour runner when a tour starts  # only if 4a justifies it
```

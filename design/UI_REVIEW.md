# UI review — instructions for the next session

A review of the running app at phone size (375×812, light and dark, three
months of sample data) on 2026-11-16. It found 17 issues. The target designs
are drawn in **`design/ui-review-mockups.html`** — open it first; the `#n`
references there match the numbers here.

**To start:** say *"Read design/UI_REVIEW.md and fix everything in it."*

## Ground rules

- **Look at the mockup, then at the real component, before editing.** File
  names below are best guesses from the component list, not verified line
  references. The repo was heavily refactored in November; search, don't assume.
- **Use the existing tokens.** Colours, type sizes and spacing come from
  `frontend/src/index.css` and `frontend/tailwind.config.js`. No new colours.
  Contrast already passes everywhere; keep it that way.
- **Follow the house conventions**: title case for labels, sentence case for
  sentences (`design/COPY_CONVENTIONS.md`); pressed state is one surface darker;
  segmented controls use `SegmentPill`; no framer `layoutId` inside a sheet;
  glass only on floating controls.
- **Tests pin visible text.** Frontend tests query by accessible name and exact
  text, so renamed labels will fail them. Update the assertion to the new
  string; do not loosen it to a regex. Run `cd frontend && npm test` after each
  group.
- **Check every change in a real browser**, not just jsdom — layout bugs are
  invisible there. Recipe below.
- **Do not push without an explicit OK.** Pushing to `main` redeploys.

## Decisions to ask Shaun before building

These change something he chose earlier, or need a product call. Ask all five
in one go at the start, then build to the answers.

1. **Tab label "Transactions" → "Ledger"** (#3) so it fits at 12px. Alternative:
   keep the word and shrink the tab's side padding, or go icon-only.
2. **Remove the bin from every ledger row** (#15). He previously chose a
   visible bin over swipe-to-delete. Alternative: keep the bin, make it 44×44.
3. **Take amounts out of the calendar cells** (#1), showing them on selection.
   Alternative: keep amounts at ≥11px with wider cells.
4. **Greet by a display name** (#14). There is no display-name field today —
   `username` is 3–20 letters, numbers or underscores. Options: add an optional
   `displayName` (backend + Edit Profile sheet), or drop the name and say
   "Welcome back".
5. **Remove the theme toggle from the top bar** (#6), leaving More → Appearance.

## The two global rules

Most of Priority 1 falls out of these.

**Type floor.** Nothing under 12px.

| Used for | Now | Target |
|---|---|---|
| Tab bar labels | 10px | 12px |
| Overlines (In / Out / Reserved, section heads, weekday letters) | 9.5–11px | 12px |
| Ledger day headers, pace captions | 11px | 12.5px (`text-meta`) |
| Calendar amounts and month tag | 8–9px | removed from cells (decision 3) |

Start with the `overline` size in `tailwind.config.js` (11px → 12px) and the
`.overline` class in `index.css`, then hunt the arbitrary sizes:

```bash
grep -rnE "text-\[(8|9|9\.5|10|10\.5|11|11\.5)px\]" frontend/src
```

**Tap floor.** Every button, link, pill and toggle has a hit area of at least
44×44px. Where the visual must stay small, grow the hit area with padding or a
`min-h-[44px]` wrapper rather than the visible shape.

## Priority 1 — readability and tapping

**#1 Text under 12px.** Apply the type floor above. Known spots: `BottomNav`
labels; Home's In/Out/Reserved strip and pace captions (`HomePage`); streak
weekday letters (`StreakDayCell`); ledger day headers (`LedgerDays`);
calendar amounts, weekday row, month tag and legend (`SpendingCalendar`,
`DailySpendingCard`); the donut's centre label (`DonutChart`).

**#2 Tap targets under 44px.** Measured sizes:

| Control | Now | Likely file |
|---|---|---|
| Calendar day cells | 39×39 | `SpendingCalendar` |
| Calendar / Chart toggle | 36×28 | `DailySpendingCard` |
| All / Expenses / Income pills | 32 tall | `LedgerFilters`, `SegmentPill` |
| This Period / History pills | 32 tall | `SpendingTabs` |
| Light / Dark switch | 32 tall | `SettingsList` / More page |
| Restore | 36 tall | `StreakRestores` |
| Transfer | 36 tall | `AccountsCard` |
| Row delete icon | 36×36 | `LedgerRow`, `TransferRow` |
| "$… under pace" link | 15 tall | `HomePage` |
| "Plan with today's budget" link | 17 tall | `StreakCard` (removed by #5) |
| Delete Account | 32 tall | More page |

Fixing `SegmentPill` once covers three of these.

**#3 Truncated text.**
- Home: "3 Restores left this m…" → "**3** restores left" (`StreakRestores`).
  Drop the shield icons; the number carries it.
- Transactions: search placeholder "Search descriptior" → "Search", field full
  width (`LedgerFilters`). Keep the `aria-label="Search transactions"`.
- Tab bar: "Transactions" touches its neighbours → decision 1.

## Priority 2 — layout and hierarchy

**#4 Ledger starts 60% down the page.** Collapse Account Activity
(`AccountsCard` on `TransactionsPage`) to one 44px row —
"2 accounts · +$1,450.00 · −$574.07 ›" — that opens the full card, with
Transfer, in a `BottomSheet`. Order becomes: title, search, type pills, account
row, list. Move the account filter into that sheet or behind an icon in the
search field. With no accounts, the row is absent (as the card is today).
Mind the UI rule in the README: never show term funding as an "In" figure
beside account income.

**#5 Home repeats itself.**
- "N days left" once, in the date line: "16 Nov · 15 days left in November"
  (use the period noun/label already available from `useBudgetPeriod`).
- Remove "Monthly · 1 – 30 Nov" and "50% of the month passed"; the tick on the
  pace bar shows it. Keep the term-mode line ("Allowance · … · Month 3 of 6") —
  that one carries information.
- Streak card: remove "$X/day for the N days after today", the "Plan with
  today's budget →" link and its own "N days left". Put "Best 26 · Silver in 2"
  on one line. The forecast already lives on Plan; check Plan shows the
  per-day figure prominently before deleting it here.
- `HomePage.test.jsx` and `StreakCard.test.jsx` pin some of these strings.

**#6 Theme toggle in the top bar.** Remove `ThemeToggle` from `Navbar`
(decision 5). Update `Navbar.test.jsx`.

**#7 Stats bar chart too tall.** Cap `StatsBarChart` at about 180px high.
Screenshot only after the Recharts animation finishes.

**#8 Friends empty state.** With no friends, replace the one-row leaderboard
and the wrapping "Find someone ›" line with a card: your rate, "Add a friend to
see how it compares.", and a primary "Find a Friend" button that focuses the
search field (`FriendsPage`). The leaderboard is unchanged once there is at
least one friend. `FriendsPage.test.jsx` covers the empty copy.

## Priority 3 — the entry sheet

Files: `AddTransactionSheet`, `EntryAmount`, `EntryFields`, `EntryDetails`,
`EntryRepeat`, `PaidBackField`, `AmountCalculator`.

**#9 One field style.** Description, date, account, paid back and repeat all
use the same outlined field: `border border-hairline-strong`, surface
background, 12px radius, 48px tall.

**#10 Amount looks tappable.** Give it a visible "Amount" label and the same
outlined field, taller (about 64px), centred figure. Keep its accessible name
("Amount, not set. Opens calculator.").

**#11 Submit button reflects state.** With no amount: disabled style, label
"Enter an amount". With one: solid, "Add Expense" / "Add Income". It must also
be `disabled`/`aria-disabled`, not just grey. The few-tap flow must survive:
category tap focuses description, its return key opens the keypad.

**#12 Keypad has one primary.** "=" becomes an ordinary operator key. The solid
button is "Use $12.50" (carrying the live figure; disabled until there is one).
Drop the separate Cancel — the ✕ closes. Title the sheet "Amount", not
"Calculator". Keys in the UI font (not mono), 48px tall. Show the expression
("8 + 4.50") in `text-meta` under the result.

**#13 Labels and the date.** Visible labels on description ("Description ·
optional"), date and account. The date shows "Today, 16 Nov" / "Yesterday,
15 Nov" / "12 Nov" and opens the native picker on tap; keep a real
`<input type="date">` underneath for accessibility and the existing max-date
rule (today, or tomorrow for timezone skew).

## Priority 4 — polish

**#14 Greeting.** Per decision 4.

**#15 Row delete.** Per decision 2. If the bin goes: tapping a row opens the
edit sheet, which gets a "Delete Entry" action at the bottom; swipe-to-delete
stays on coarse pointers; the 10-second undo toast is unchanged. Pending
(unsaved) rows still can't be edited or deleted. This touches
`useLedgerDeletes`, `LedgerRow`, `TransferRow` and several tests in
`TransactionsPage.test.jsx` and `src/blackbox/pages.blackbox.test.jsx` that
click "Delete Kopi" — rewrite those to the new path rather than deleting them.

**#16 Plan titles.** "What if I buy…" → "What If I Buy…"; "Pace & forecast" →
"Pace & Forecast"; "Goal ↔ daily cap" → "Savings Goal or Daily Cap";
"Dynamic daily budget" → "Dynamic Daily Budget". `PlanPage.test.jsx` and
`pages.blackbox.test.jsx` match some of these.

**#17 Bottom clearance.** The last element on every page clears the floating
tab bar by at least 24px. Pages already use `--dock-clear` (`index.css`);
check Tracker ("Compare with Friends"), Stats, Plan and More at the bottom of
their scroll.

## Not reviewed — look at these too

- The login page.
- Every sheet under More: Budget Period, Savings Target, Bank Accounts,
  Categories, Repeating Entries, Notifications, App Icon, Tours.
- The empty/new-user states and the setup checklist.
- Days mode and term mode (the review used month mode).

Apply the two global rules to all of them, and report anything else found
rather than silently redesigning it.

## How to see the real app

No Docker needed. From the saved "verifying UI in the real app" notes:

1. A scratch script that starts `mongodb-memory-server`, sets env the way
   `backend/test/blackbox/_harness.js` does, imports `backend/index.js`'s
   `app`, creates a user, runs `seedHistoryFor(user, { months: 3,
   withAccounts: true })` from `backend/lib/demoSeed.js`, listens on 5055 and
   prints `signToken(user)`.
2. `cd frontend && API_URL=http://localhost:5055 VITE_API_URL= node_modules/.bin/vite --port 5180`
   (use `node_modules/.bin/vite`, not `npx vite`).
3. Open `http://localhost:5180`, set `localStorage.bnm_token` to the printed
   token and `localStorage.bnm_theme` to `light` or `dark`, view at 375×812.
4. The rate limiter trips after a few dozen loads (the app drops to login);
   restart the scratch server.

## Done when

- No text under 12px and no interactive element under 44×44 on any page —
  measure with a script over `document.querySelectorAll`, don't eyeball.
- Nothing truncates at 375px wide, in month, days and term mode.
- Each screen matches its mockup, in light and dark.
- `npm test` is green in `frontend/`, `npx eslint .` is clean, `vite build`
  succeeds.
- Before/after screenshots of each changed screen are shown to Shaun.

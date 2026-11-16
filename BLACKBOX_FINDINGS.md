# Black-box findings — instructions for the next session

A black-box test pass (2026-11-14 to 16) wrote 771 tests from the docs and the
function signatures, without reading the implementations. It found the bugs
below. The start-of-month Home bug is already fixed; the rest are open.

**To start:** say *"Read BLACKBOX_FINDINGS.md and fix everything in it."*

## How the open bugs are marked

Each open bug has one or more tests that currently fail **on purpose** and are
marked so CI stays green:

- Backend (`node:test`): `it("…", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, …)`
- Frontend (Vitest): `it.fails("…", …)`

For each bug: fix the code, then **remove the marker** so the test is an
ordinary one, and confirm it passes. A frontend `it.fails` test starts failing
the moment the bug is fixed, which is the reminder to remove it.

Find them all with:

```bash
grep -rn "known bug, see BLACKBOX_FINDINGS" backend/test/blackbox
grep -rn "it.fails(" frontend/src
```

Do **not** change a test's expectation to make it pass. If an expectation looks
wrong, stop and ask.

## Run the tests

```bash
cd backend && npm test
cd frontend && npm test
```

Both must be fully green, with no `todo` and no `it.fails` left, when done.
Tests can flake under load; re-run a single file before believing a failure.

## The bugs, most important first

### 1. Home ignores a carried savings target
`GET /api/auth/home` is the only period-aware endpoint that does not
materialise a repeating savings target into a new month. `/api/streak`,
`/api/period`, `/api/accounts` and `/api/auth/me` all do. On the first load of
a month Home can show a budget without the reserve while the streak card
reserves it.
- Tests: `backend/test/blackbox/budget.blackbox.test.js` — "the homepage's
  first answer of the month already reserves it", "the homepage and the streak
  agree on the first load of a new month".
- Likely place: `backend/controllers/homeController.js`; the helper is
  `ensureCurrentMonthSavings` in `backend/lib/savingsCarry.js`. Keep it out of
  the shared period loader — the README explains why (friends' documents).

### 2. Deleting an account that a repayment was paid into succeeds
`DELETE /api/auth/accounts/:id` refuses when a transaction's `accountId` or a
transfer references the account, but not when a transaction's
`paidBackAccountId` does. The entry is left pointing at nothing.
- Test: `accountsAndMore.blackbox.test.js` — "refuses to delete one that a
  repayment was paid into". Expected: `409`, same message as the other cases.

### 3. Friend search returns 500 for a non-string query
`GET /api/friends/search?q=a&q=b` (or `?q[$ne]=x`) throws, because `q` arrives
as an array or object.
- Test: `accountsAndMore.blackbox.test.js` — "a query sent as an object or a
  list is refused, not a server error". Expected: any status under 500 (400,
  or an empty list).

### 4. A failed transactions load looks like an empty ledger
When `fetchTransactions` rejects, the Transactions page shows the error toast
but the body still says "Nothing Logged Yet … Add Your First Entry".
- Test: `frontend/src/blackbox/pages.blackbox.test.jsx` — "a failed load does
  not pretend the ledger is empty".
- Follow `design/COPY_CONVENTIONS.md` for whatever replaces it. Home has the
  same weakness when the *stats* request fails; worth fixing alongside.

### 5. Non-text input is coerced and saved
- A description, account name or category name sent as an object is stored as
  `"[object Object]"`; a number is stored as its string.
- An amount of `true` is stored as `1`, `[5]` as `5`.
- `checkAmount(0.004)` returns `{ value: 0 }` (the API itself rejects it, the
  helper does not).
- Tests: `logic.blackbox.test.js` (3), `authAndEntries.blackbox.test.js` (2),
  `accountsAndMore.blackbox.test.js` ("refuses a name that is not text", twice).
- Likely place: `backend/lib/entryFields.js`, plus the account and category
  handlers. Expected: `400`. Numeric strings such as `"12.5"` are still accepted
  today and no test forbids that — leave them working.

### 6. Monthly percentages can total 101%
`/api/summary/all` rounds saved and spent separately: $800 in, $700 out gives
13% + 88%.
- Test: `budget.blackbox.test.js` — "percentages are of that month's income
  and add up to 100". Derive one from the other.
- Careful: the README says the month-mode equivalence suite must not change.
  This is the summary controller, not the streak, so it should be unaffected —
  confirm `backend/test/streak.test.js` still passes.

### 7. `formatMoney` can print "-$0.00"
`formatMoney(-0.001)` and `formatMoney(0.3 - 0.1 - 0.2)` give `-$0.00`.
- Test: `frontend/src/lib/lib.blackbox.test.js` — "formatMoney never prints a
  negative zero". `AnimatedNumber` formats on its own and likely needs the same.

### 8. `badgeFor(undefined)` and `nextBadge(undefined)` throw
Also for `NaN`. A streak that has not loaded would crash the badge.
- Test: `lib.blackbox.test.js` — "a streak that has not loaded yet has no
  badge, rather than crashing the card".

### 9. Unknown category uses the light grey in dark mode
`categoryColor(getCategory("Nope"), true)` returns `FALLBACK_COLOR`, not
`FALLBACK_COLOR_DARK`. Shows up on entries filed under a deleted custom
category.
- Test: `lib.blackbox.test.js` — "an unknown category gets the dark fallback in
  dark mode, not the light one". A real custom category must keep its own
  colour in both themes (a passing test pins that).

### 10. The streak names a lapsed period differently
`/api/streak` returns `periodStatus: "inactive"` where `/api/period` and
`/api/auth/home` return `"lapsed"` or `"none"`.
- Test: `periods.blackbox.test.js` — "the streak names a lapsed period the way
  /api/period and home do".
- **Ask before changing this.** It may be deliberate, and the frontend
  (`StreakCard`) may compare against `"inactive"`. If it is deliberate, delete
  the test instead.

## Noticed but not pinned by a test

Seen during the pass and left out of the list above. None has a failing test
yet. For each: **confirm it first** (reproduce, or read the code), write a test
that fails, then fix. Items marked *ask* are product calls — raise them with
Shaun rather than deciding.

### 11. A rate-limit response looks like being logged out
When the API answers `429`, the app drops to the login screen with no message.
Source: the saved "verifying UI" notes, not a test from this pass — reproduce
it before fixing. Expected: stay signed in and say the server is busy; only a
`401` should end the session. Likely place: `frontend/src/api/client.js` and
`useAuth`.

### 12. Transactions in term mode on the 1st reads as a new account
With a funded term and no entries yet in the new cycle, the page says "Nothing
Logged Yet. Your first entry takes about four taps." Same family as the Home
bug already fixed. Expected: an empty-this-month message that does not treat
the user as new. Reproduce with the `termOpts` fixture in
`frontend/src/blackbox/pages.blackbox.test.jsx`.

### 13. Month mode on the 1st greets an existing user as new — *ask*
Home shows "Welcome" (not "Welcome back") and the "Nothing Logged Yet" state to
someone with months of history. Shaun's report was limited to period mode, so
this was left alone. Ask whether month mode should show last month's recent
entries or a "new month" message instead.

### 14. A one-month term starting on the 31st ends on the 27th — *ask*
`termEnd("2026-01-31", 1)` is `2026-02-27`: 28 days, and the 28th is outside
the term. It follows from "the day before the same date N months on" with the
date clamped. The client mirrors the server, so both agree. Ask what the end
should be before changing either `backend/lib/period.js` or
`frontend/src/lib/period.js` — they must stay identical (a black-box test
cross-checks them).

### 15. Income logged late re-grades earlier days — *ask*
The daily budget uses the whole period's income, whenever it was logged, so
income added on the 20th can turn a broken day on the 5th into a win. This
matches the README and is pinned by "uses the whole period's income, whenever
in the period it was logged" in `budget.blackbox.test.js`. Do not change it
without asking; changing it also breaks the month-mode equivalence suite.

### 16. Ledger day labels drop the year
An entry from a previous year is headed "31 Dec", identical to this year's.
Expected: add the year when it differs from the current one, as
`formatDayRange` already does. Likely place: `frontend/src/lib/ledger.js`.

### 17. The username inside the login token goes stale
`signToken` puts `username` in the JWT, so after a rename the token carries the
old name for up to seven days. Check whether anything reads it from the token
(`tokenUserId` only reads `id`). If nothing does, drop the claim.

### 18. `spentAmount` ignores the entry type
`spentAmount({ type: "income", amount: 100 })` returns `100`. Nothing calls it
that way today — `sumEntries` branches on type first — but `incomeAmount` is
type-aware and this one is not. Make it return `0` for income.

### 19. Blank bands while scrolling — check on a real phone
On Home and More, some preview-pane screenshots showed content cut off above
the tab bar mid-scroll, then fine on the next scroll. Possibly an artefact of
the preview pane. Check on an iPhone before spending time on it.

## Not tested at all

The black-box pass did not cover these. Add tests in the same style
(`backend/test/blackbox/`, `frontend/src/blackbox/`), and report what they find
rather than fixing silently.

- Google sign-in and the `/auth/callback` page.
- The service worker and the push settings screens (jsdom has no push service).
- The tours and the setup checklist (`frontend/src/tour/`).
- Double-tapping a save button: does it send two requests?
- Demo account expiry and eviction (`sweepExpiredDemoUsers`,
  `evictDemosToCap`, `POST /api/auth/demo/sample`).
- The rate limiter itself, the security headers and the cross-origin rules.
- A security review. Input validation and cross-user isolation were tested;
  nothing beyond that.

## Already fixed (2026-11-16)

Home said "Nothing Logged Yet" on the 1st of a month in term mode, and in days
mode when a period began the month before. `frontend/src/pages/HomePage.jsx`
now loads Recent by the period's own range (from the term's start in term
mode) and only shows the empty state when the stats show no money either.
Pinned by `frontend/src/blackbox/homeMonthStart.blackbox.test.jsx`.

**Still to do for it:** check it in the real app in term mode, following the
"verifying UI in the real app" notes — it has only been tested in jsdom.

## Before pushing

- `backup/local-main-2026-11-16` is a local-only branch holding five older
  refactor commits that the remote had already redone differently. Delete it
  once you are sure nothing in it is wanted.
- Work against local Mongo only.
- Pushing to `main` redeploys Vercel and Cloud Run. Get an explicit OK first.
- Vercel lands before Cloud Run; confirm the backend revision before calling a
  backend fix live.

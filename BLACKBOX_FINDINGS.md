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

# Multiple accounts — implementation plan

> **Status: both phases shipped 2026-08-07.** Kept as the design record — the
> decisions in §2 and the edge cases in §8 are the reasoning behind the code,
> not a to-do list. The one deviation from the plan below: transfer entry became
> its own `TransferSheet` rather than a third mode of the add-entry form, since
> it shares almost nothing with it (no category, no description, two account
> fields instead of one).

Tag every transaction with the bank account it came from or went to, filter by
account, and see how much of this period's money is sitting in each one.

Written 2026-08-07. Two phases; phase 1 is independently useful and should be
lived in for a while before phase 2 lands.

---

## 1. The problem

The app models money as one pool: total income − savings target, spread over the
days of a period. That is the right model for *"how much can I spend today?"* —
the answer doesn't depend on which bank holds the money.

It is the wrong model for *"can I pay for this right now?"*. With a Trust account
for PayWave and a DBS account for PayNow, an empty Trust account means the
payment fails no matter how healthy the budget looks. The app currently cannot
represent that.

---

## 2. Decisions already settled

Recorded so they aren't relitigated later. Each of these was a real fork.

### 2.1 The budget stays pool-wide; accounts are shown beside it

Per-account *budgets* are not well-defined. If the period budget is $600 and the
money is split $200 / $400, there is no "Trust budget" — the split is where money
physically sits, not a decision about what may be spent. Slicing it would produce
an arbitrary number that says "you're broke" while cash sits in the other account.

So: **one budget, computed exactly as it is today.** Accounts add a second view of
the same money.

### 2.2 No opening balances — accounts are period-scoped

An account's figure is *this period's* money in it:

```
net(A) = income into A − spent from A + transfers in − transfers out
```

Every transfer has one `from` and one `to`, so transfers cancel across accounts:

```
Σ net(A)  =  total income − total spent
```

…which is exactly the numerator of the daily budget before the savings reserve.
The account strip and the budget card are therefore the same money sliced two
ways, and they can be shown to reconcile on screen.

**Consequence, accepted knowingly:** this is not the bank's number. If Trust
carries over $500 from last period, the app shows only what moved this period.
Everything else in the app is period-scoped, so a lifetime balance would be the
odd one out. If the gap ever matters, the smallest fix is one starting amount per
account plus period-to-period carry-over — deliberately *not* in this plan.

### 2.3 Transfers are not transactions

A transfer lives in its own collection, never in `Transaction`.

The reason is concrete. Four places branch on `type`, and they disagree about
what an unknown third value means:

| Location | Code | A `"transfer"` row would become |
|---|---|---|
| `backend/controllers/streakController.js:91` | `if (type === "expense") … else` | **income** — inflates the daily budget |
| `backend/controllers/authController.js:296` | `if (type === "income") … else` | **spending** |
| `backend/controllers/friendController.js:191` | `if (type === "income") … else` | **spending** — corrupts the leaderboard |
| `backend/controllers/summaryController.js:27,30` | explicit `$eq` on both | **ignored** |

Three different behaviours, none of which errors. Keeping transfers out of
`Transaction` means the streak, summaries, savings rate and leaderboard cannot
see them **by construction** rather than by remembering to filter in four places.

A by-product: normalising those four branches becomes optional hygiene rather
than a prerequisite. Worth doing eventually, not needed here.

### 2.4 Accounts are embedded in the user, mirroring custom categories

There are at most a handful per user, they are needed on every page, and
`User.customCategories` already establishes the pattern — including arriving free
with `/api/auth/me` and being served to the UI by a context provider. Accounts
follow it exactly, so `useAccounts` is a near-copy of `useCategories`.

Transfers cannot be embedded (unbounded), so they get a collection.

### 2.5 Historical transactions need no migration

Because totals are period-scoped, untagged rows from before accounts existed
never enter the calculation. Only the current period's rows matter.

---

## 3. Non-goals

- Real bank balances, opening balances, carry-over between periods.
- Bank/API integration of any kind (see the roadmap note: aggregators need a
  company entity, and SGFinDex requires being MAS-regulated).
- Per-account savings targets. Both accounts are for spending; the savings
  reserve stays pool-wide and unallocated to any account.
- Multi-currency.

---

## 4. Data model

### 4.1 `User.accounts` (new embedded array)

`backend/models/User.js`, alongside `customCategories`:

```js
// Bank accounts the user splits their spending across (e.g. one card for
// PayWave, one for PayNow). Embedded rather than a collection for the same
// reasons as customCategories: a handful per user, wanted on every page, and
// they ride along with /api/auth/me instead of costing a request.
accounts: [
  {
    name:     { type: String,  required: true, trim: true, maxlength: 24 },
    color:    { type: String,  required: true },
    archived: { type: Boolean, default: false },
  },
],
```

`MAX_ACCOUNTS = 8` in `authController.js` — keeps the picker a chip row rather
than a scrolling list.

### 4.2 `Transaction.accountId` (new field)

`backend/models/Transaction.js`:

```js
// Which account the money moved through. A subdocument id on User.accounts, so
// no `ref` — the client resolves name and colour from the auth profile, exactly
// as it does for custom categories. Null on rows logged before accounts existed.
accountId: { type: mongoose.Schema.Types.ObjectId, default: null },
```

```js
transactionSchema.index({ userId: 1, accountId: 1 });
```

### 4.3 `Transfer` (new collection)

`backend/models/Transfer.js`:

```js
// Money moved between the user's own accounts. Deliberately NOT a Transaction:
// it is neither income nor expense, and every aggregation that branches on
// `type` would classify it differently (see ACCOUNTS_PLAN.md §2.3).
const transferSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    from:   { type: ObjectId, required: true },
    to:     { type: ObjectId, required: true },
    amount: { type: Number, required: true, min: 0.01, max: 1e9 },
    date:   { type: Date, required: true },
  },
  { timestamps: true }
);

transferSchema.index({ userId: 1, date: 1 });
```

No `month` / `year` fields: unlike `Transaction`, transfers are only ever queried
by date range for the active period, never grouped by calendar month. Adding them
would be dead weight.

---

## 5. API

### Phase 1

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/accounts` | `{ name, color }` → `201 { id, name, color, archived }` |
| `PATCH` | `/api/auth/accounts/:id` | `{ name?, color?, archived? }` → `200` |
| `DELETE` | `/api/auth/accounts/:id` | `409` if any transaction or transfer references it, with a message pointing at archive |
| `GET` | `/api/auth/me` | gains `accounts: [{ id, name, color, archived }]` |
| `POST` | `/api/transactions` | accepts optional `accountId` |
| `GET` | `/api/transactions` | accepts optional `accountId` filter |

Mount the account routes in `backend/routes/auth.js` next to the existing
category routes, with the same `requireAuth, blockDemoMutations, asyncHandler`
chain.

Validation for create/update, mirroring `addCategory`:
- `name` required, trimmed, ≤ 24 chars, case-insensitively unique among the
  user's accounts → `409` on clash
- `color` must match the existing `HEX_COLOR` regex
- at most `MAX_ACCOUNTS` non-archived accounts → `400` beyond that

`accountId` validation on `POST /api/transactions`: if present, it must match a
non-archived account on `req.user`, else `400 "Choose a valid account"`. Absent
is allowed in phase 1.

### Phase 2

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/accounts?today=YYYY-MM-DD` | per-account totals for the active period |
| `POST` | `/api/transfers` | `{ from, to, amount, date }` |
| `GET` | `/api/transfers?start=&end=` | for listing/undo |
| `DELETE` | `/api/transfers/:id` | |

New file `backend/routes/accounts.js`, mounted in `backend/index.js`:

```js
app.use("/api/accounts", accountRoutes);
```

`GET /api/accounts` response:

```jsonc
{
  "period": { "start": "2026-08-01", "end": "2026-08-31", "savings": 200 },
  "accounts": [
    { "id": "…", "name": "Trust", "color": "#…",
      "income": 0, "spent": 38, "transfersIn": 50, "transfersOut": 0, "net": 12 }
  ],
  "unassigned": { "income": 0, "spent": 4.5, "net": -4.5 },
  "totals": { "income": 800, "spent": 448, "net": 352,
              "reserved": 200, "leftToSpend": 152 }
}
```

Implementation notes:
- Resolve the period with `loadPeriodContext(req.user, todayKey)` — the same
  helper every other period-aware endpoint uses. No active period → `accounts`
  with zeroed totals and `period: null`.
- Two aggregations bounded by `period.start`/`period.end`: one over
  `Transaction` grouped by `accountId`, one over `Transfer` grouped by `from`
  and by `to`.
- `unassigned` covers rows with `accountId: null` inside the period, so the
  strip's arithmetic still ties out during the transition. Omit the key entirely
  when it is all zeroes.
- `totals.leftToSpend = net − reserved`, and `totals.net` must equal
  `Σ accounts[].net + unassigned.net`. Assert this in a test.

`POST /api/transfers` validation:
- `from` and `to` both exist on `req.user.accounts`, are not archived, and
  `from !== to` → `400`
- `amount` finite, `> 0`, `≤ 1e9`, passed through `roundMoney`
- `date` through `parseTransactionDate` (the existing helper — UTC midnight, not
  in the future, year bounds)

---

## 6. Phase 1 — accounts, tagging, filtering

No balances. The goal is that tagging is habitual and the data is trustworthy
*before* anything depends on it.

### 6.1 Backend

1. `models/User.js` — add the `accounts` array (§4.1).
2. `models/Transaction.js` — add `accountId` + the compound index (§4.2).
3. `controllers/authController.js` — `addAccount`, `updateAccount`,
   `removeAccount`, modelled on `addCategory` / `removeCategory`. Add
   `MAX_ACCOUNTS`. Include `accounts` in the `getMe` payload.
4. `routes/auth.js` — three routes next to the category ones.
5. `controllers/transactionController.js`
   - `createTransaction`: accept and validate `accountId`.
   - `getTransactions`: accept an `accountId` query param; `accountId=none`
     filters to untagged rows.
6. `DELETE /api/auth/accounts/:id` must count referencing transactions **and**
   transfers before allowing removal.

### 6.2 Frontend

1. `src/hooks/useAccounts.jsx` — `AccountsProvider` + `useAccounts`, a close
   parallel of `useCategories.jsx`: seed from `user.accounts`, expose
   `{ accounts, active, getAccount, addAccount, updateAccount, removeAccount }`
   where `active` excludes archived.
2. `src/App.jsx` — wrap the tree in `AccountsProvider` beside `CategoriesProvider`.
3. `src/api/endpoints.js` — `addAccount`, `updateAccount`, `removeAccount`, and
   an `accountId` param on `fetchTransactions`.
4. `src/pages/MorePage.jsx` — a "Bank accounts" row in the same list as
   "Savings target", opening a sheet that lists accounts with colour swatches and
   supports add / rename / recolour / archive. Reuse the colour picker from the
   custom-category panel in `TransactionsPage`.
5. `src/pages/TransactionsPage.jsx`
   - Account chips in the add sheet, above the category grid. Hidden entirely
     when the user has no accounts, so nothing changes for people who never make
     one.
   - Default to the last used account, persisted in `localStorage` under
     `bnm_last_account`. This keeps the flow at zero extra taps in the common
     case and slots in before the existing category → description → amount
     hand-off.
   - An account filter beside the existing All / Expenses / Income pills.
   - Show the account name on each ledger row (small, muted, next to the
     category).

### 6.3 Tests

Backend (`backend/test/accountsApi.test.js`, new):
- creates an account and returns it on `/api/auth/me`
- rejects a duplicate name case-insensitively (`409`)
- rejects a bad colour, an over-long name, and the 9th account
- rejects a transaction referencing an unknown or archived account
- `GET /api/transactions?accountId=` filters; `accountId=none` returns untagged
- refuses to delete an account that has transactions, and archives instead
- demo account is blocked from all of it

Frontend (`src/pages/TransactionsPage.test.jsx`, extend):
- the account picker is absent when the user has no accounts
- picking an account submits its id
- the last used account is preselected on the next open
- the filter narrows the ledger

### 6.4 Done when

Every new transaction carries an account without extra taps, the ledger can be
filtered by account, and nothing about the budget, streak or stats has moved.
Verify the last part by running the full backend suite — those numbers must be
byte-identical.

---

## 7. Phase 2 — per-account totals and transfers

These ship **together**. Without transfers, an account that receives no income
shows a negative total as soon as it is spent from, and the strip looks broken.

### 7.1 Backend

1. `models/Transfer.js` (§4.3).
2. `controllers/accountController.js` — `getAccountTotals` (§5).
3. `controllers/transferController.js` — `createTransfer`, `listTransfers`,
   `deleteTransfer`.
4. `routes/accounts.js`, `routes/transfers.js`, both mounted in `index.js`.
5. `DELETE /api/auth/me` (account deletion) must also delete that user's
   transfers — see the existing `Promise.all` cleanup block.
6. `lib/demoSeed.js` — give the demo/seeded account two accounts and tag the
   generated rows, so the strip has something to show. Add a transfer or two.

### 7.2 Frontend

1. `src/components/AccountsCard.jsx` — the strip, rendered on `HomePage` under
   the budget card:

   ```
   In your accounts
     Trust                 $12.00
     DBS                  $340.00
                         ────────
     Total                $352.00
     Reserved for savings −$200.00
     Left to spend        $152.00
   ```

   The reserved line is what stops "Trust + DBS" and "left to spend" looking
   like they disagree. Show `unassigned` as its own row only when non-zero.
2. Transfer entry: a third button in `TransactionsPage` beside Income and
   Expense, opening the same sheet in a transfer mode — from, to, amount, date.
   Reuse `AmountCalculator`.
3. Transfers appear in the ledger as a visually distinct row (no +/− sign, a
   `Trust → DBS` label) and are excluded from the income/expense filters.
4. `src/api/endpoints.js` — `fetchAccountTotals`, `addTransfer`, `removeTransfer`.

### 7.3 Tests

Backend (`backend/test/transfers.test.js`, new):
- **a transfer leaves the streak byte-identical** — the single most important
  test here; snapshot `/api/streak` before and after posting one
- a transfer leaves `/api/summary/all` and the friends leaderboard unchanged
- `POST /api/transfers` rejects `from === to`, unknown accounts, archived
  accounts, zero and negative amounts, future dates
- `GET /api/accounts` totals: `Σ accounts[].net + unassigned.net === totals.net`
- transfers only count toward the active period, not neighbouring ones
- deleting the user deletes their transfers

Frontend:
- `AccountsCard` renders the reserved line and the arithmetic ties out
- a negative account total renders plainly rather than clamped at zero
- the strip is absent when the user has no accounts

### 7.4 Done when

The homepage shows where this period's money sits, transferring between accounts
moves both figures, and the streak/stats/leaderboard are provably untouched.

---

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Account total goes negative | Render plainly, don't clamp. Shouldn't normally happen — in real life you transfer before you pay — but a back-dated expense or an unlogged transfer can produce it, and hiding it would hide a real data gap. |
| Untagged transactions inside the period | Roll into an `unassigned` row so the arithmetic still ties out. Hide the row when zero. |
| Archived account with history | Excluded from pickers, still shown in the strip while it has non-zero totals for the period. |
| No accounts created | Every account UI is hidden. The app behaves exactly as it does today. This is the default state and must stay clean. |
| No active period (days mode, lapsed) | `GET /api/accounts` returns `period: null` and zeroed totals; the strip hides. |
| Transfer dated outside the active period | Allowed and stored; simply doesn't affect the current period's figures. |
| Deleting an account with history | `409`, with a message directing to archive. |

---

## 9. Risks

- **Tagging discipline.** One untagged transaction quietly shifts the strip.
  Mitigated by the last-used default and the `unassigned` row, which makes the
  gap visible rather than silently absorbing it.
- **Not the bank's number.** §2.2. Make sure the card is labelled "In your
  accounts" and never "Balance".
- **Scope creep toward accounting.** Opening balances, carry-over and
  reconciliation are all one small step away and all out of scope. Adding them
  changes what the app *is*; that should be a deliberate decision, not a
  follow-up commit.
- **`TransactionsPage.jsx` is already ~940 lines** and phase 1 adds a picker, a
  filter and a transfer mode. Extract the add sheet into its own component
  before, not after.

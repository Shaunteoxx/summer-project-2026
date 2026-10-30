# 💸 Broke No More

A **mobile-first** full-stack budgeting web app — *know exactly how much you can spend today and how much you need to save for tomorrow.*

Built with **React + Vite**, **Node + Express**, and **MongoDB**, with Google OAuth, JWT auth, smooth Framer Motion animations, and Recharts visualisations.

---

## ✨ Features

- **Google OAuth** sign-in (Passport.js) with JWT auth and protected routes
- **Demo** — *Try the Demo* on the sign-in screen opens a private sandbox that starts empty, with sample data one tap away in the top bar. Signing out deletes it, and any left behind are swept after 24 hours
- **Mobile-first UI** — phone-width layout, a floating glass dock (four tabs, Home, Transactions, Tracker and More, plus the add button), drag-to-dismiss bottom sheets, safe-area aware
- **Installable** — add it to your Home Screen and it opens full screen like an app. On iPhone and iPad you can choose its Home Screen icon (Wallet or Piggy Bank) under More → App Icon before adding it
- **Dark & light theme** — dark first (light if your system asks for it), with a toggle in the top bar and under More → Appearance, and no flash on load
- **Three ways to budget** — by **calendar month** (the default), by a **custom number of days** (1–366) for allowances that don't run monthly (a fortnight, five weeks, half a month), or as an **allowance**: one lump sum spread over 1–12 calendar months and budgeted a month at a time, so overspending one month shrinks the months after it. You start each custom period yourself and start the next when it ends; days in between simply aren't budgeted, and never count against your streak
- **Bank accounts** — tag each entry with the account it came from or went into (one card for PayWave, another for PayNow), filter the ledger by account, and see what went in and out of each account this period in the **Account Activity** card on Transactions. **Transfers** move money between your own accounts without ever touching the budget. Deliberately not bank balances: there are no opening figures, so an account shows only what has moved through it this period
- **Repeating entries** — tick **Repeat Monthly** while logging rent and it's set up in the same breath, on the day you already picked; the rule starts *after* the entry you're adding, so the month you just logged is never posted twice. Manage them (weekly schedules, pausing, editing) under More → Repeating Entries. Either way it's added for you on each due date. A rule that lands on the 31st uses the last day of shorter months rather than skipping them. What it writes is an ordinary transaction: correct it, delete it, or stop the rule entirely and the entries it already added stay put. Nothing is ever back-filled into days you've already lived through, and pausing means what it says — resuming starts from the day you resume
- **Repeating savings target** — turn on *Repeat Every Month* and each new month starts with your most recent target instead of $0, so a target that doesn't change never has to be re-entered. Months you've already lived through are never touched
- **Homepage** — what's left to spend this period (after reserving your savings target) shown as the one big figure, with a **pace bar** whose fill is budget spent and whose tick is where even spending would put you, plus a verdict such as "$46.15 under pace" that opens Plan's forecast; the days left, an In / Out / Reserved strip (Allowance / Out / Reserved in allowance mode) that doubles as the way into Tracker's breakdown, today's budget with your streak, and the **four most recent entries**. Until setup is done, a short checklist walks you through the first steps
- **Streak** — a day counts when you spend no more than that day's budget (a no-spend day counts too). **Restores** repair a broken day, about three per 30 days and only within the current period, and a new **badge** arrives every five days on budget: Bronze, Silver, Gold, Platinum, Sapphire, Amethyst, Diamond, then Diamond 2, 3 and on
- **Transactions**
  - Add from the **+** button in the dock: the sheet opens on Expense, with an Expense / Income toggle at the top
  - **Few-tap entry** — the **description is optional** and falls back to the category name (the placeholder shows exactly what will be saved), the date defaults to today, and the amount has a calculator keypad (+ − × ÷). Everything stays visible and editable, so fixing a mis-tapped category is still one tap
  - **Instant saves** — the row appears and the sheet closes before the server answers. If the server refuses the save, the row comes back out and the sheet reopens on what you typed
  - **Shared bills** — on an expense, *Paid back by friends* records what friends returned to you. Only your share counts against the budget, and anything paid back beyond the bill counts as income
  - **Categories** — fixed set (F & B, Transport, Shopping, Entertainment, Travel · Allowance, Job, Gifts) plus **user-created custom categories** with their own colour, added from the entry sheet's **+ New** tile and removed under More → Categories
  - Entries grouped by day; **search** by description or category, **filter** by All / Expenses / Income and by account
  - Tap an entry to correct it; deleting one gives you a **10-second undo**
- **Plan** — four **live planners** driven by your real period data (so every number matches the homepage): a **dynamic daily budget** that updates the moment you log an expense, a **what-if purchase** planner, **pace & forecast** projections, and **goal ↔ daily-cap** conversion. Reached from More, and from Home's pace verdict and streak card
- **Tracker** — a ring of what's unspent and spent this period (plus what's reserved, once you set a savings target), a **savings-goal card** (progress, on-track status, edit in place), and a **day-by-day spending calendar** covering the whole budget period (tap any day for its transactions; days with income get a dot; toggleable bar-chart view with each day's budget drawn as a stepped line). Periods longer than 45 days page by calendar month so the grid stays readable. **Plus a colour-coded "spending by category" donut**, and in allowance mode a card for the allowance as a whole. Every day is judged against the same rolling daily budget the homepage shows
- **History** — Tracker's second view, behind its **This Period / History** toggle (`/stats`, titled *All Months*): an **All Time / Per Month** toggle over the headline figures (all-time totals and the true savings rate, both stopping at the window you're still living in, or months tracked and the average month), a grouped bar chart across every month, and a **day-by-day calendar of the last 12 months**, paged by month (the totals and chart still cover everything — only the calendar is windowed, since it needs every transaction in its span). Deliberately **always calendar months**, whatever your budget period is, so long-term history stays stable and covers every day
- **Friends** — search users, send/accept/decline requests, and an all-time savings-rate leaderboard that shows percentages, never amounts. Reached from More and from the *Compare with Friends* button on Tracker
- **Profile** — editable display name and avatar: one of seven **Twemoji** characters, your Google photo, or a monogram on a colour taken from your name. Tap the header on More to edit it; Delete Account sits under Log Out
- **Notifications** (optional) — web push for **today's budget each morning** and an **evening reminder** on days you haven't logged anything, sent in your own time zone. Needs VAPID keys on the server (see Step 1); on iPhone the app has to be added to the Home Screen first
- **Guided tours and tips** — each page has a short tour the first time you open it, tips appear as you come across things, and a setup guide walks a new account through its first steps. Replay any tour, or turn tips off, under More → Tours & Tips
- **Vibration** — a tap as you type and save, on phones that support it (Android, and iPhone on iOS 18+). Switch it off under More → Vibration
- **Overspend warning** — go past a period's income-minus-savings and the app says how far past you are, with buttons to **Add Income** or **Lower Target**, instead of quietly showing a $0/day budget
- **Toast notifications** for key actions (add/delete, friend requests, etc.)
- **Accessibility & polish** — skeleton loading states, focus-visible rings, and full `prefers-reduced-motion` support
- Quiet motion throughout: short fades and small slides, count-ups, and animated charts

## 🧱 Tech Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, React Router 7, Vite 8, Tailwind CSS 3, shadcn-style UI, Framer Motion, Recharts, lucide-react, Axios |
| Backend  | Node.js, Express 4, Passport (Google OAuth 2.0), JWT, Mongoose 8, web-push, node-cron, Helmet, express-rate-limit |
| Database | MongoDB 7 (via Docker) |
| Tests    | Vitest 5 + Testing Library (frontend), `node:test` + mongodb-memory-server (backend), ESLint |
| Dev setup | Docker Desktop (runs MongoDB + backend + frontend together) |
| Hosting  | Vercel for the frontend; any HTTPS container host, such as Cloud Run, for the backend (see *Production deployment*) |

---

## 📁 Project Structure

```
/frontend          → React frontend (Vite)
  /public          → Twemoji avatar SVGs, app icons, web app manifest, service worker (push), theme-init.js
  /scripts         → Dev tools: icons.mjs renders the app icons, shots.mjs screenshots the design harness
  /src
    /api           → Axios client + endpoint helpers
    /animations    → Shared Framer Motion variants
    /assets        → Brand mark
    /components    → Reusable UI (incl. /ui shadcn-style primitives) and the bottom sheets
    /hooks         → Contexts + hooks (auth, budget period, accounts, categories, repeating entries, push notifications, theme, toast, …)
    /lib           → Formatters and money maths, budget-period helpers, categories, avatars, haptics, app icon, streak badges
    /pages         → One file per page
    /tour          → Guided tours, tips and the setup guide
    /test          → Vitest setup (jsdom + Testing Library)
  harness.html     → Design harness (dev only, see *Tests*)
/backend           → Express backend
  /config          → Environment checks, DB + Passport config
  /controllers     → Route logic
  /jobs            → The hourly notification run (morning budget, evening reminder)
  /lib             → Budget periods and allowances, money maths, repeating entries, savings carry, push, demo sandbox, validation
  /middleware      → Auth (JWT) + async wrapper
  /models          → Mongoose schemas
  /routes          → Express routers
  /scripts         → One-off CLIs: seed sample history into an account, run notifications by hand, rename a category, rebuild the old shared demo account (`npm run seed:demo`)
  /test            → node:test suites (in-memory MongoDB)
/design            → Design system plan, mockups and copy conventions
/.github/workflows → CI: tests, frontend build, dependency audit
docker-compose.yml → Runs all three services with one command
.env.example       → Environment variable template
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** — download from https://www.docker.com/products/docker-desktop
- A **Google account** to create free OAuth credentials (no credit card required)

That's it. Node.js and MongoDB do not need to be installed on your machine. You only
need Node.js to run the tests or the design harness outside Docker (see *Tests*).

---

### Step 1 — Create your `.env` file

```bash
cp .env.example backend/.env
```

Open `backend/.env` and fill in these values:

```
GOOGLE_CLIENT_ID=        ← from Google Cloud Console (see Step 2)
GOOGLE_CLIENT_SECRET=    ← from Google Cloud Console (see Step 2)
JWT_SECRET=              ← any long random string (run: openssl rand -hex 32)
SERVER_URL=              ← public URL of the backend (e.g. https://your-app.run.app)
                           Used to build the Google OAuth callback URL.
                           Leave as http://localhost:5000 for local dev.
```

Leave `MONGO_URI`, `PORT`, `CLIENT_URL` and `GOOGLE_CALLBACK_URL` as they are.

Push notifications are optional. Without the keys below everything else works, and
the Notifications setting simply doesn't appear. To turn them on, generate a key pair
once and add it:

```bash
npx web-push generate-vapid-keys --json
```

```
VAPID_PUBLIC_KEY=        ← "publicKey" from the command above
VAPID_PRIVATE_KEY=       ← "privateKey"
VAPID_SUBJECT=           ← a mailto: address or https URL where you can be reached
```

Keep the same pair afterwards: changing it breaks every existing subscription.

---

### Step 2 — Set up Google OAuth (free)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (any name).
3. Go to **OAuth consent screen** → choose **External** → fill in app name and your email → save.
4. Add your Google account as a **Test user** so you can log in.
5. Go to **Credentials** → **Create Credentials** → **OAuth client ID**.
6. Application type: **Web application**.
7. Under **Authorized redirect URIs** add exactly:
   ```
   http://localhost:5000/api/auth/google/callback
   ```
8. Copy the **Client ID** and **Client Secret** into `backend/.env`.

---

### Step 3 — Start the app

Make sure **Docker Desktop is open**, then from the project root run:

```bash
docker compose up --build
```

Wait for all three services to start. You'll know it's ready when you see:

```
frontend-1  |   ➜  Local:   http://localhost:5173/
backend-1   | ✅ MongoDB connected: mongodb://mongo:27017/brokenomore
backend-1   | 🚀 Server running on http://localhost:5000
```

Open **http://localhost:5173** in your browser and sign in with Google. 🎉

---

### Subsequent runs

After the first build you don't need `--build` anymore:

```bash
docker compose up
```

To stop everything:

```bash
docker compose down
```

To stop and delete all saved data (wipes the database):

```bash
docker compose down -v
```

Both services run your working tree, so edits to `frontend/` or `backend/` take
effect on save — the frontend hot-reloads, the backend restarts itself. The one
thing that isn't picked up automatically is a change to a `package.json`: each
service's dependencies live in a named volume (`backend_modules`,
`frontend_modules`) that Docker only fills the first time it is created. After
adding a package, or pulling someone else's dependency change, refresh that
service's volume:

```bash
docker compose stop backend && docker compose rm -f backend
docker volume rm summer-project-2026_backend_modules
docker compose up -d --build backend
```

For the frontend, swap `backend` for `frontend` in all three commands. The volume
names start with your project folder's name, so run `docker volume ls` if yours
differ.

Note `docker volume rm`, not `docker compose down -v` — the latter removes every
volume in the project, including the database.

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose` command not found | Make sure Docker Desktop is installed and open |
| App hangs, server never connects | Wait a few more seconds — MongoDB takes a moment to start |
| `redirect_uri_mismatch` from Google | The redirect URI in Google Cloud Console must be **exactly** `http://localhost:5000/api/auth/google/callback` |
| "Access blocked" from Google | Add your Google account as a **Test user** on the OAuth consent screen |
| Port 5173 or 5000 already in use | Stop whatever is using that port, or run `docker compose down` first |
| A backend route you just wrote returns 404 | The container is running stale code. Check `docker compose logs backend` for a crash on the last restart — a syntax error leaves the old process dead rather than reloading |
| `Cannot find package '…'` or `Cannot find module '…'` after pulling | A dependency changed without refilling that service's node_modules volume — see the commands under *Subsequent runs* |
| No Notifications setting under More → Preferences | The backend has no VAPID keys (see Step 1), or the browser doesn't support push. After adding the keys, run `docker compose up -d backend`: a plain `docker compose restart` keeps the container's old environment |

---

## 🧪 Tests

```bash
cd backend  && npm test    # node:test + in-memory MongoDB
cd frontend && npm test    # Vitest + Testing Library (jsdom)
npm run lint               # ESLint, in either folder
```

Outside Docker, the frontend needs **Node 22.12 or newer** (Vitest 5's minimum)
and the backend runs on Node 20 or newer. CI uses the same versions as the Docker
images: Node 22 for the frontend and Node 20 for the backend.

CI runs both suites on every push and pull request, then builds the frontend and
runs `npm audit`, which fails only on a critical advisory in a production
dependency. The backend suite includes an
**equivalence check**: budgeting by calendar month must produce byte-identical
results to the implementation that predated budget periods, which is kept
verbatim in `backend/test/fixtures/legacyStreak.js`. If you change the
month-mode budget maths, that suite is meant to fail.

Frontend tests query by **accessible name** (`getByRole(…, { name })`) and by
exact visible text, so renaming a button or a heading is expected to fail them.
Update the assertion to the new string rather than loosening the matcher to a
regex — a matcher that accepts either casing stops pinning the copy at all.
Two things are deliberately *not* asserted on: `aria-label`-only strings, since
screen readers don't announce capitalisation, and anything CSS uppercases
(`.overline`, and the inline `uppercase` on Home's In / Out / Reserved strip),
where the source casing never reaches the screen.

A caution the suite has already been bitten by: **don't pin a date the test
doesn't control.** One case asserted `startKey: "2026-08-16"` from an entry
dated the 15th, which passed until the day the suite ran later than the 16th —
after which `repeatPlan` clamps the start to today and the failure looked like
a code regression. Derive dates from `new Date()`, or from the mocked
`localToday` where a suite mocks it (`StatsPage.test.jsx` pins it to
`2026-03-20`, which is what makes "the running month" testable at all).

### Design harness (visual checks without the backend)

`frontend/harness.html` mounts a single component at phone size, in either
theme, with no server, database or login involved — for looking at UI work
rather than asserting on it.

```bash
cd frontend
npm run dev                    # then open /harness.html
npm run shots                  # screenshots every state to frontend/.shots/
```

`npm run shots` drives the Chrome already on your machine — no Playwright
install. Three traps it handles for you, all of which fail *silently* otherwise:

1. Headless Chrome clamps its window to a **500px minimum** width, so a 375px
   phone viewport is unreachable via `--window-size`. The harness takes
   `?width=375` and pins the sheet's `max-w-app` cap instead.
2. `--window-size` height includes ~87px of browser chrome.
3. Under `--virtual-time-budget`, **every framer-motion spring spends virtual
   time**. Enough scripted key presses will exhaust the budget mid-sequence and
   the screenshot captures a half-entered state that looks entirely plausible.
   The harness therefore disables motion unless you pass `?motion=on`.

Every shot asserts both the viewport *and* the rendered state it captured
(`expect` in `SHOTS`), so none of the above can pass unnoticed.

Add states by editing `SHOTS` in `frontend/scripts/shots.mjs`; `?press=1,2,+,8`
clicks keys after mount so a shot can capture a mid-expression display. The
harness is dev-only — `vite build` has a single `index.html` entry, so it never
reaches `dist/`.

---

## 🔌 API Overview

Every route needs a `Bearer <JWT>` header except the Google OAuth start and callback,
`POST /api/auth/demo`, the health checks, and `POST /api/jobs/notifications`, which
takes an `X-Cron-Secret` header instead.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/healthz` | Liveness check |
| GET | `/readyz` | Readiness check: 503 until MongoDB answers (also at `/api/health`) |
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback → redirects with JWT |
| POST | `/api/auth/demo` | Start a private demo sandbox and sign into it |
| POST | `/api/auth/demo/sample` | Fill the demo sandbox with sample history (`replace: true` overwrites existing entries) |
| POST | `/api/auth/refresh` | Swap a still-valid token for a fresh one |
| POST | `/api/auth/logout` | Sign out everywhere: revokes every token and push subscription, and deletes a demo sandbox |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/home` | Homepage stats |
| PATCH | `/api/auth/profile` | Update display name, avatar, time zone, or whether tips are on |
| POST | `/api/auth/tours` | Mark tours and tips as seen (`POST /api/auth/tours/forget` lets them run again) |
| POST | `/api/auth/accounts` | Create a bank account (`PATCH`/`DELETE` by id; delete refuses once it has history) |
| POST | `/api/auth/recurring` | Create a repeating entry (`PATCH` to edit or pause, `DELETE` to stop it; entries already added stay) |
| GET | `/api/accounts` | Per-account totals for the active period |
| GET | `/api/transfers` | Transfers in a date range (`POST` to create, `DELETE` by id) |
| PUT | `/api/auth/savings` | Set a calendar month's savings target (`repeat` carries it into future months) |
| DELETE | `/api/auth/me` | Delete account (and all its data) |
| POST | `/api/auth/categories` | Add a custom category |
| DELETE | `/api/auth/categories/:id` | Delete a custom category |
| GET | `/api/period` | Budget mode, the active period or allowance, and past ones |
| PUT | `/api/period/mode` | Switch between calendar months, custom days and an allowance |
| POST | `/api/period` | Start a budget period |
| PATCH | `/api/period/:id` | Change a period's start date, length or savings target |
| DELETE | `/api/period/:id` | Remove a period (its transactions are kept) |
| POST | `/api/period/term` | Set up an allowance: a start date and 1–12 months (`PATCH`/`DELETE` by id) |
| GET | `/api/transactions` | List transactions by `?start=&end=` or `?month=&year=` |
| POST | `/api/transactions` | Add a transaction |
| PATCH | `/api/transactions/:id` | Correct one — partial; `type` is not editable |
| DELETE | `/api/transactions/:id` | Delete a transaction |
| GET | `/api/summary?month=&year=` | One calendar month's summary |
| GET | `/api/summary/all` | All monthly summaries (drives History) |
| GET | `/api/summary/lifetime` | All-time earned/spent/saved, excluding the running window |
| GET | `/api/streak` | Streak, today's budget, and the period's per-day budgets |
| POST | `/api/streak/restore` | Use a restore to repair a broken day in the current period |
| GET | `/api/friends` | Friends list |
| GET | `/api/friends/search?q=` | Search users by username |
| GET | `/api/friends/requests` | Incoming friend requests |
| GET | `/api/friends/comparison` | All-time savings leaderboard (you + friends) |
| POST | `/api/friends/request/:id` | Send a friend request |
| POST | `/api/friends/accept/:id` | Accept a friend request |
| POST | `/api/friends/decline/:id` | Decline a friend request |
| GET | `/api/push/key` | The VAPID public key, or `null` when push isn't configured |
| GET | `/api/push/subscription?endpoint=` | Which notifications this device has turned on |
| POST | `/api/push/subscription` | Register this device and the notifications it wants |
| POST | `/api/push/unsubscribe` | Forget this device |
| POST | `/api/push/test` | Send a test notification to your devices |
| POST | `/api/jobs/notifications` | Send whatever notifications are due, for an hourly scheduler (404 unless `CRON_SECRET` is set) |

---

## 🎨 Design Notes

- **A quiet, neutral theme, dark first.** Colour carries meaning rather than brand: green only for money coming in or kept, red only for over budget, and everything else in three levels of ink. The tokens are HSL CSS variables in `frontend/src/index.css`; the reasoning is in `design/REVAMP_PLAN.md`, with the original mockups in `design/mockups.html`.
- Category colours are generated in **OKLCH at one fixed lightness**, so a chart's slices read as one family, and they skip the green band that means money. Each category also pairs its colour with an icon, so meaning never relies on colour alone.
- Motion is short and quiet: one iOS-style ease-out (`cubic-bezier(.32, .72, 0, 1)`) and four durations (120ms micro, 180ms base, 260ms enter, 340ms sheets), mostly opacity with 4–6px of travel. All of it respects `prefers-reduced-motion`.
- Monthly and lifetime summaries are calculated from canonical transactions at read time, avoiding stale duplicate financial state.
- **One budget model everywhere:** the rolling daily budget — (income − savings target − spent on earlier days in the period) ÷ days left in the period, with the month's share of the allowance in place of income in allowance mode — is computed once in the streak controller (`computeStreak`) and served by `/api/streak` to Home, Tracker, Plan and the entry sheet, so every surface agrees. The "left to spend" arithmetic underneath it is defined once too, in `backend/lib/budget.js`, which Home's headline, the accounts card and the streak all call.
- **Budget periods have three shapes.** In month mode the period is *derived* from the calendar and nothing is stored; in days mode it is a stored row the user starts by hand; in allowance mode a stored window (`models/BudgetTerm.js`) is split into calendar-month cycles, each funded by its share of what the lump sum has left, so overspending one month leaves less for the next. A single resolver (`backend/lib/period.js`) hides the difference behind `(date) → period | null`, so nothing downstream branches on the mode. A `null` result means the day falls outside every period: it has no budget, so the streak skips it rather than counting it as a loss.
- **A repeating savings target is materialised, never inferred.** The obvious way to carry a target into a new month is a read-time fallback ("no target this month? use the last one"). That would be wrong: the streak resolves a period for *every day since your first transaction*, so a fallback would retroactively give past months a target they never had, shrinking historical daily budgets and rewriting the streak. Instead `backend/lib/savingsCarry.js` writes a real entry for the current month, once, and never for a past one — so a stored `0` has to mean "saving nothing" rather than "unset", which is why `PUT /api/auth/savings` stores zeros instead of deleting the key. It is also called from the owner-scoped handlers rather than the shared period loader, because the friends leaderboard runs that loader over *other people's* documents.
- **Restores scale with length** — roughly three per thirty days — so a short period isn't trivially forgiving and a long one isn't punishing.
- **Restores lapse with their period.** A restore can only repair a day in the current period; once the next period starts, the old period's broken days stay broken and its unspent restores are gone. Days already restored keep their restore. The streak itself still runs across periods, so the card says where it stops when the break is in a past period and no Restore button is offered.
- **Repeating entries are written, never evaluated.** A rule (rent, a subscription) is a template that produces a real transaction on each due date, and from then on that row is ordinary in every respect — the streak, summaries and per-account totals see it without knowing it was generated, and you can correct or delete it like anything else. The alternative, evaluating rules at read time, fails for the same reason a read-time savings fallback does: `computeStreak` walks every day since your first transaction, so editing a rule would keep changing what past days cost. Two guards make materialising safe to attempt on any request — a `lastRunKey` watermark on the rule short-circuits it once a day, and a unique partial index on `(userId, recurringId, dueKey)` means two requests racing on app open cannot both insert the same occurrence. `dueKey` is stored rather than derived from the row's date precisely so that correcting the date doesn't free the day up to be written twice.
- **A rule can only start today or later.** Back-filling would write entries into days already lived through and rewrite the streak for them — the trap `lib/savingsCarry.js` documents. Catching up after a week away is different and does happen: those days hadn't been seen yet, and the money really did move. Pausing follows the same rule, so resuming starts from the day you resume rather than replaying the gap. The one concession is a day of timezone skew, since a client west of UTC sends a local date that reads as yesterday: that clamps up to today instead of being refused.
- **An edit sends only what changed, and can't change a type.** `PATCH /api/transactions/:id` is partial, so tagging a row that predates accounts is a one-field request and an edit can never blank out a field the client didn't know to send. Two things fall out of that. A row tagged to an account you have since archived survives being edited: the picker can't offer that account and the API would refuse to be sent it, but an untouched field is never sent in the first place. And `accountId: null` has to be spelled out to clear a tag, since an absent key means "leave it alone" — which is why tapping the selected account chip deselects it rather than being a dead end. `type` is refused outright: categories are per-type, so switching would have to silently drop the category, and an entry that changes sign is a different entry. Nothing derived is rewritten on an edit — the streak, summaries and per-account totals are all computed at read time from these rows — but `month`/`year` must move with `date`, because the history views group by them and would otherwise disagree with the row they're grouping.
- **Accounts split where money sits, never the budget.** Per-account *budgets* would be arbitrary — if the period budget is $600 and the money is split $200/$400, there is no "Trust budget", only a fact about where it happens to be. So the budget stays pool-wide and accounts are a second view of the same money. Because every transfer has one `from` and one `to`, transfers cancel across accounts and `Σ per-account net === income − spent`, which is exactly the daily budget's numerator before the savings reserve. The **Account Activity** card on Transactions shows each account's In and Out rather than a net figure that would look like a balance. In allowance mode, where a month's money doesn't arrive through any account, it adds one sentence that does the subtraction (money in, minus reserved, minus spent) to land on Home's left-to-spend figure.
- **Transfers are not transactions.** They live in their own collection (`models/Transfer.js`). Four places branch on `Transaction.type`, and an unknown third value would mean three different things to them — the streak would read it as income and inflate the daily budget, the home totals and leaderboard as spending, the monthly summaries would ignore it. A separate collection makes every one of those blind to transfers by construction rather than by remembering to filter in four places. `backend/test/transfers.test.js` pins it: posting a transfer leaves `/api/streak` byte-identical.
- **Two savings rates, on purpose.** The all-time rate is `total saved ÷ total earned`, so every dollar counts once. The per-month figure is the *mean of each month's rate*, so every month counts once — a $50 month weighs as much as a $2,000 one. They give different numbers on lumpy income, which is why the lenses are labelled "Your finished windows" and "Each month counts once" rather than both being called an average.
- **All-time savings stops at the window you're still in.** `backend/lib/lifetime.js` totals everything up to the day before your active period opens, and hands back that day as `through` so the four /stats tiles and the friends header can say where they stop. The window you are living in is money you *haven't spent yet*, not money you kept — counting it made the totals read like an achievement on day 2 and put the rate near 100% exactly when it knew least. It is a separate endpoint (`GET /api/summary/lifetime`) rather than a sum of `/summary/all`, because that one is a per-month history that has to stay whole for the chart and the breakdown, and because outside month mode the running window isn't a calendar month at all — in days mode it's an arbitrary span, and with no period running there is nothing in progress to hold back, so everything counts. Term mode needs the same funding-not-income swap the budget and the streak make: a term's lump sum lands once and is released a cycle at a time, so the running term contributes what its *finished cycles were funded*, not the whole sum sitting in the ledger. Terms that have ended keep their raw income, since every cycle of theirs has been released.
- **The leaderboard scores all-time, not the period you're in.** It used to rank everyone on their own running window, which made it a race nobody could lose: on day 2 of a month every player sits near 100% because almost none of the money has been spent, so the ranking mostly reported who had logged the least so far. It now runs on the same settled figure as /stats. Everyone still needs their own period context, because that names where their totals stop — and reading a friend's context stays a read, never a write (see `lib/savingsCarry.js`). Two aggregates cover the whole board however long the friends list is, since a per-person cutoff makes it an `$or` rather than one date range.
- **"Saved" means money actually set aside, and appears once.** Money you merely haven't spent yet is **unspent**, everywhere. The distinction is not pedantry: `(income − spent) ÷ income` reads ~97% on day 2 of a month, so a savings app calling that "saved" congratulates you hardest when it knows least — and Home used to show it as "Saved this month 77%" directly beneath a bar reading "31% spent", the two disagreeing because they divide by different things. Home now labels the bar itself, **N% spent**, and has no separate unspent figure that could disagree with it (an *Unspent So Far* tile filled that role until allowances arrived); the strip cell below is **Reserved**, because a savings target is a plan rather than an achievement. Tracker's ring and breakdown tile say **Unspent** for the same reason — that page renders the *running* period. On /stats the income denominator is the right one, because a finished month's unspent money really was saved, so the label stays — except on the one row that is still running, which reads "unspent so far". The all-time tiles used to sum that running window in and carry a caveat saying so; naming it wasn't enough, since with one month tracked the tiles *were* the running month. They now end at it.
- **The pace verdict is an amount, not a placing.** Home's bar pins one interpretation to the right of the "% spent" line, and it used to read "Ahead of pace" / "Behind pace". That inverted against the bar directly beneath it: fill past the tick is the trouble case, so *ahead* meant bad on the bar and good in the label, twenty pixels apart. It now reads "$46.15 under pace" — under and over describe an amount rather than a position in a race, so they can't swap sense. The number is the other half of the fix: the two percentages either side of the bar already say which way this is going, and the one thing they can't say is by how much, since a percentage of a budget isn't a sum you can spend. A gap under half a dollar reads "On even pace" rather than "$0.00 under pace", and being past the budget entirely still reads "$1,204.50 past", which was never ambiguous.
- **Copy conventions are written down, not re-derived.** `design/COPY_CONVENTIONS.md` holds the rules a reviewer would otherwise have to infer: Apple-style title case for labels, buttons, headings and column headers against sentence case for body, hints and error messages (the test is *is it a label, or is it a sentence?*); and the error-ending rule — **toasts** carry "Please try again", **inline form errors** don't. That second one is mechanical rather than arbitrary: a toast vanishes and takes the action with it, while an inline error sits beside the submit button that would retry it. It also matches where each kind of failure lands, since nearly every write does `err?.response?.data?.message || "Couldn't …"`, so a server refusal shows the server's own text inline and the fallback is the request that never arrived.
- **The money locale is pinned, not inherited.** `toLocaleString(undefined, …)` follows the *reader's* browser for separators, so a de-DE machine renders `$1.240,00` — our symbol, their decimal comma, an amount that reads as a different number. `formatMoney` and `AnimatedNumber` both pin `en-SG` from one exported `LOCALE`, and `AnimatedNumber` puts the sign ahead of the prefix so a negative total reads `-$160.00` rather than `$-160.00` and agrees with `formatMoney` on the same figure. Currency support itself is still deliberately out of scope (SGD only); `LOCALE` is the single place to change when that stops being true.
- **The history calendar is capped at 12 months, the figures aren't.** Headline totals, the bar chart and the breakdown run on `/summary` aggregates, which stay cheap however long your history gets. The calendar needs every *transaction* in its span, so that request is windowed to the last twelve whole calendar months — aligned to the 1st, because its pager steps a month at a time. When the cap bites, the card's subtitle says "The last 12 months" instead of "Every day you've tracked": showing a truncated window under an all-time label would read as a stretch of months with no spending.
- **The history calendar shows no budget verdicts.** On the Tracker a day is tinted green or red against its own daily budget. /stats spans months with different targets, so there is no single budget to judge a day against — it shows amounts only. `DailySpendingCard` takes empty `periodDays` and switches every verdict off together (tints, budget line, legend, per-day budget in the detail sheet) rather than leaving some half-on.
- **History stays on calendar months by design.** Periods drive the live budget, streak and tracker only. Keeping history monthly means it always covers every day, stays stable when you change your period length, and still answers "what did I spend in July?".
- Animal avatars are [Twemoji](https://github.com/jdecked/twemoji) (© Twitter, **CC-BY 4.0**).

## Production deployment

`docker-compose.yml` is for local development only. Public deployments should run the
backend behind HTTPS (for example, Cloud Run), use a managed MongoDB deployment, and
serve the frontend through Vercel or another static host.

Required backend environment variables in production:

- `NODE_ENV=production`
- `MONGO_URI` using a least-privilege database user
- `JWT_SECRET` with at least 32 random characters
- `CLIENT_URL` and `SERVER_URL` as HTTPS origins without trailing paths
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the matching HTTPS callback URL

Optional:

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` turn on push
  notifications (see Step 1 for generating them). Set both keys or neither; the
  server refuses to start with only one.
- `CRON_SECRET` (32+ characters) for hosts that pause between requests, such as
  Cloud Run, where a timer inside the server can't be relied on. Have Cloud
  Scheduler `POST /api/jobs/notifications` every hour with the secret in an
  `X-Cron-Secret` header. On an always-on host, leave it empty and the server
  sends notifications on its own hourly timer.
- `MORNING_BUDGET_HOUR` and `DAILY_REMINDER_HOUR` set the local hour each
  notification goes out (defaults 8 and 21).
- `DEMO_MAX_LIVE` caps how many demo sandboxes can exist at once (default 200).
  When it's reached, the oldest are deleted to make room.

Configure `VITE_API_URL` independently in each Vercel Production/Preview environment.
`CLIENT_URL` must exactly match the deployed frontend origin, and Google Cloud must list the exact callback
URL. The server refuses to start when production configuration is incomplete.

Before a public release:

1. Rotate any credential that has ever been copied into chat, logs, or source control.
2. Restrict MongoDB network access, enable backups/PITR, and verify restore procedures.
3. Configure `/healthz` as the liveness probe and `/readyz` as the readiness probe.
4. Configure centralized logs/alerts and an external/shared rate-limit layer.
5. Run `npm ci && npm run build` in `frontend`, build the backend image, and perform an
   authenticated smoke test against isolated non-production data.
6. Verify Google OAuth, direct SPA route loads, account deletion, and mobile keyboard/
   screen-reader navigation on the deployed origins.

The repository supplies frontend security headers in `frontend/vercel.json`. If the API
moves away from `*.run.app`, update the CSP `connect-src` directive before deployment.

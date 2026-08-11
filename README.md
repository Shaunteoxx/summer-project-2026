# 💸 Broke No More

A **mobile-first** full-stack budgeting web app — *know exactly how much you can spend today and how much you need to save for tomorrow.*

Built with **React + Vite**, **Node + Express**, and **MongoDB**, with Google OAuth, JWT auth, smooth Framer Motion animations, and Recharts visualisations.

---

## ✨ Features

- **Google OAuth** sign-in (Passport.js) with JWT auth and protected routes
- **Mobile-first UI** — phone-width layout, bottom tab bar, drag-to-dismiss bottom sheets, safe-area aware
- **Dark & light theme** — system-aware with a manual toggle (no flash on load)
- **Budget periods** — budget by **calendar month** (the default) or by a **custom number of days**, for allowances that don't run monthly (a fortnight, five weeks, half a month). You start each custom period yourself and start the next when it ends; days in between simply aren't budgeted, and never count against your streak
- **Bank accounts** — tag each entry with the account it came from or went into (one card for PayWave, another for PayNow), filter the ledger by account, and see on the homepage where this period's money is sitting. **Transfers** move money between your own accounts without ever touching the budget. Deliberately not bank balances: there are no opening figures, so an account shows only what has moved through it this period
- **Repeating savings target** — turn on *Repeat every month* and each new month starts with your most recent target instead of $0, so a target that doesn't change never has to be re-entered. Months you've already lived through are never touched
- **Homepage** — what's left to spend this period (after reserving your savings target) with the days left, accumulated savings, a daily-budget streak, and animated count-up stats
- **Transactions**
  - Add income / expenses from a bottom sheet (type fixed by an Income/Expense button)
  - **Few-tap entry** — the **description is optional** and falls back to the category name (the placeholder shows exactly what will be saved), the date defaults to today, and the sheet hands you along: picking a category focuses the description, and its return key opens the amount keypad. Everything stays visible and editable, so fixing a mis-tapped category is still one tap
  - **Categories** — fixed set (Food & Drinks, Transport, Shopping, Entertainment, Travel · Allowance, Job, Gifts) plus **user-created custom categories** with their own colour
  - **Search** by description or category, **filter** by All / Expenses / Income
  - Optimistic delete with a **10-second undo**
- **Calculator** — four **live planners** driven by your real month data (so every number matches the homepage): a **dynamic daily budget** that updates the moment you log an expense, a **what-if purchase** planner, **pace & forecast** projections, and **goal ↔ daily-cap** conversion
- **Tracker** — donut of saved vs spent, a **savings-goal card** (progress, on-track status, edit in place), and a **day-by-day spending calendar** covering the whole budget period (tap any day for its transactions; toggleable bar-chart view with each day's budget drawn as a stepped line). Periods longer than 45 days page by calendar month so the grid stays readable. **Plus a colour-coded "spending by category" donut**. Every day is judged against the same rolling daily budget the homepage shows
- **Stats** — an **All time / Per month** toggle over the headline figures (all-time totals and the true savings rate, or months tracked and the average month), a grouped bar chart across every month, and a **day-by-day calendar of the last 12 months**, paged by month (the totals and chart still cover everything — only the calendar is windowed, since it needs every transaction in its span). Reachable from the top *and* bottom of the Tracker. Deliberately **always calendar months**, whatever your budget period is, so long-term history stays stable and covers every day
- **Friends** — search users, send/accept/decline requests, savings-rate leaderboard
- **Profile** — editable display name, pick a cute **animal avatar** (Twemoji), and delete account
- **Overspend warning** — go past a period's income-minus-savings and the app says how far past you are, instead of quietly showing a $0/day budget
- **Toast notifications** for key actions (add/delete, friend requests, etc.)
- **Accessibility & polish** — skeleton loading states, focus-visible rings, and full `prefers-reduced-motion` support
- Premium animations throughout: page transitions, count-ups, fade/scale-ins, animated charts

## 🧱 Tech Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, React Router v6, Tailwind CSS, shadcn-style UI, Framer Motion, Recharts, lucide-react, Axios |
| Backend  | Node.js, Express, Passport (Google OAuth20), JWT, Mongoose |
| Database | MongoDB 7 (via Docker) |
| Dev setup | Docker Desktop (runs MongoDB + backend + frontend together) |

---

## 📁 Project Structure

```
/frontend          → React frontend (Vite)
  /public/avatars  → Twemoji animal avatar SVGs
  /src
    /api           → Axios client + endpoint helpers
    /animations    → Shared Framer Motion variants
    /components    → Reusable UI (incl. /ui shadcn-style primitives)
    /hooks         → Contexts + hooks (auth, theme, toast, categories, chart colours, count-up)
    /lib           → utils (cn, formatters), budget-period helpers, category + avatar definitions
    /pages         → One file per page
    /test          → Vitest setup (jsdom + Testing Library)
/backend           → Express backend
  /config          → DB + Passport config
  /controllers     → Route logic
  /middleware      → Auth (JWT) + async wrapper
  /models          → Mongoose schemas
  /routes          → Express routers
  /lib             → Budget-period resolution, validation, demo seed
  /test            → node:test suites (in-memory MongoDB)
docker-compose.yml → Runs all three services with one command
.env.example       → Environment variable template
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** — download from https://www.docker.com/products/docker-desktop
- A **Google account** to create free OAuth credentials (no credit card required)

That's it. Node.js and MongoDB do not need to be installed on your machine.

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

Leave `MONGO_URI`, `PORT`, and `CLIENT_URL` as they are.

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

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose` command not found | Make sure Docker Desktop is installed and open |
| App hangs, server never connects | Wait a few more seconds — MongoDB takes a moment to start |
| `redirect_uri_mismatch` from Google | The redirect URI in Google Cloud Console must be **exactly** `http://localhost:5000/api/auth/google/callback` |
| "Access blocked" from Google | Add your Google account as a **Test user** on the OAuth consent screen |
| Port 5173 or 5000 already in use | Stop whatever is using that port, or run `docker compose down` first |

---

## 🧪 Tests

```bash
cd backend  && npm test    # node:test + in-memory MongoDB
cd frontend && npm test    # Vitest + Testing Library (jsdom)
```

Both suites run in CI on every push. The backend suite includes an
**equivalence check**: budgeting by calendar month must produce byte-identical
results to the implementation that predated budget periods, which is kept
verbatim in `backend/test/fixtures/legacyStreak.js`. If you change the
month-mode budget maths, that suite is meant to fail.

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

All routes except the OAuth start/callback require a `Bearer <JWT>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback → redirects with JWT |
| POST | `/api/auth/demo` | Log in to the shared read-only demo account |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/home` | Homepage stats |
| PATCH | `/api/auth/profile` | Update display name / avatar |
| POST | `/api/auth/accounts` | Create a bank account (`PATCH`/`DELETE` by id; delete refuses once it has history) |
| GET | `/api/accounts` | Per-account totals for the active period |
| GET | `/api/transfers` | Transfers in a date range (`POST` to create, `DELETE` by id) |
| PUT | `/api/auth/savings` | Set a calendar month's savings target (`repeat` carries it into future months) |
| DELETE | `/api/auth/me` | Delete account (and all its data) |
| POST | `/api/auth/categories` | Add a custom category |
| DELETE | `/api/auth/categories/:id` | Delete a custom category |
| GET | `/api/period` | Budget mode, the active period, and past periods |
| PUT | `/api/period/mode` | Switch between calendar months and custom days |
| POST | `/api/period` | Start a budget period |
| PATCH | `/api/period/:id` | Change a period's start date, length or savings target |
| DELETE | `/api/period/:id` | Remove a period (its transactions are kept) |
| GET | `/api/transactions` | List transactions by `?start=&end=` or `?month=&year=` |
| POST | `/api/transactions` | Add a transaction |
| DELETE | `/api/transactions/:id` | Delete a transaction |
| GET | `/api/summary/all` | All monthly summaries (drives Stats) |
| GET | `/api/streak` | Streak, today's budget, and the period's per-day budgets |
| POST | `/api/streak/restore` | Spend a save to repair the streak |
| GET | `/api/friends` | Friends list |
| GET | `/api/friends/search?q=` | Search users by username |
| GET | `/api/friends/requests` | Incoming friend requests |
| GET | `/api/friends/comparison` | Savings leaderboard (you + friends) |
| POST | `/api/friends/request/:id` | Send a friend request |
| POST | `/api/friends/accept/:id` | Accept a friend request |
| POST | `/api/friends/decline/:id` | Decline a friend request |

---

## 🎨 Design Notes

- **Dark-first**, emerald-accent theme (money/savings feel) with a system-aware light mode, defined as HSL CSS variables in `frontend/src/index.css`.
- Category colours use a **muted palette** so charts stay cohesive rather than clashing; each category pairs a colour with an icon so meaning never relies on colour alone.
- Animation defaults: `easeOut` easing, durations between 0.4s–0.8s; all motion respects `prefers-reduced-motion`.
- Monthly and lifetime summaries are calculated from canonical transactions at read time, avoiding stale duplicate financial state.
- **One budget model everywhere:** the rolling daily budget — (income − savings target − spent on earlier days in the period) ÷ days left in the period — is computed once in the streak controller and reused by the homepage, tracker, and calculator, so every surface agrees.
- **Budget periods have two shapes.** In month mode the period is *derived* from the calendar and nothing is stored; in days mode it is a stored row the user starts by hand. A single resolver (`backend/lib/period.js`) hides the difference behind `(date) → period | null`, so nothing downstream branches on the mode. A `null` result means the day falls outside every period: it has no budget, so the streak skips it rather than counting it as a loss.
- **A repeating savings target is materialised, never inferred.** The obvious way to carry a target into a new month is a read-time fallback ("no target this month? use the last one"). That would be wrong: the streak resolves a period for *every day since your first transaction*, so a fallback would retroactively give past months a target they never had, shrinking historical daily budgets and rewriting the streak. Instead `backend/lib/savingsCarry.js` writes a real entry for the current month, once, and never for a past one — so a stored `0` has to mean "saving nothing" rather than "unset", which is why `PUT /api/auth/savings` stores zeros instead of deleting the key. It is also called from the owner-scoped handlers rather than the shared period loader, because the friends leaderboard runs that loader over *other people's* documents.
- **Restores scale with length** — roughly three per thirty days — so a short period isn't trivially forgiving and a long one isn't punishing.
- **Accounts split where money sits, never the budget.** Per-account *budgets* would be arbitrary — if the period budget is $600 and the money is split $200/$400, there is no "Trust budget", only a fact about where it happens to be. So the budget stays pool-wide and accounts are a second view of the same money. Because every transfer has one `from` and one `to`, transfers cancel across accounts and `Σ per-account net === income − spent`, which is exactly the daily budget's numerator before the savings reserve. The homepage card shows that reserve as its own line so the two views are seen to reconcile rather than looking like they disagree.
- **Transfers are not transactions.** They live in their own collection (`models/Transfer.js`). Four places branch on `Transaction.type`, and an unknown third value would mean three different things to them — the streak would read it as income and inflate the daily budget, the home totals and leaderboard as spending, the monthly summaries would ignore it. A separate collection makes every one of those blind to transfers by construction rather than by remembering to filter in four places. `backend/test/transfers.test.js` pins it: posting a transfer leaves `/api/streak` byte-identical.
- **Two savings rates, on purpose.** The all-time rate is `total saved ÷ total earned`, so every dollar counts once. The per-month figure is the *mean of each month's rate*, so every month counts once — a $50 month weighs as much as a $2,000 one. They give different numbers on lumpy income, which is why they're labelled "Of everything earned" and "Each month counts once" rather than both being called an average.
- **The history calendar is capped at 12 months, the figures aren't.** Headline totals, the bar chart and the breakdown run on `/summary` aggregates, which stay cheap however long your history gets. The calendar needs every *transaction* in its span, so that request is windowed to the last twelve whole calendar months — aligned to the 1st, because its pager steps a month at a time. When the cap bites, the card's subtitle says "The last 12 months" instead of "Every day you've tracked": showing a truncated window under an all-time label would read as a stretch of months with no spending.
- **The history calendar shows no budget verdicts.** On the Tracker a day is tinted green or red against its own daily budget. /stats spans months with different targets, so there is no single budget to judge a day against — it shows amounts only. `DailySpendingCard` takes empty `periodDays` and switches every verdict off together (tints, budget line, legend, per-day budget in the detail sheet) rather than leaving some half-on.
- **Stats stays on calendar months by design.** Periods drive the live budget, streak and tracker only. Keeping history monthly means it always covers every day, stays stable when you change your period length, and still answers "what did I spend in July?".
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

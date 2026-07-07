# 💸 Broke No More

A **mobile-first** full-stack budgeting web app — *know exactly how much you can spend today and how much you need to save for tomorrow.*

Built with **React + Vite**, **Node + Express**, and **MongoDB**, with Google OAuth, JWT auth, smooth Framer Motion animations, and Recharts visualisations.

---

## ✨ Features

- **Google OAuth** sign-in (Passport.js) with JWT auth and protected routes
- **Mobile-first UI** — phone-width layout, bottom tab bar, drag-to-dismiss bottom sheets, safe-area aware
- **Dark & light theme** — system-aware with a manual toggle (no flash on load)
- **Homepage** — what's left to spend this month (after reserving your monthly savings) with the days left in the month, accumulated savings, a daily-budget streak, and animated count-up stats
- **Transactions**
  - Add income / expenses from a bottom sheet (type fixed by an Income/Expense button)
  - **Categories** — fixed set (Food & Drinks, Transport, Shopping, Entertainment, Travel · Allowance, Job, Gifts) plus **user-created custom categories** with their own colour
  - **Search** by description or category, **filter** by All / Expenses / Income
  - Optimistic delete with a **10-second undo**
- **Calculator** — daily spend budget & savings-goal calculators with animated results
- **Monthly Tracker** — donut of saved vs spent, a **day-by-day spending bar chart** (today highlighted, over-budget days flagged, your daily budget marked), **plus a colour-coded "spending by category" donut**
- **Stats** — months tracked + average savings rate, and a grouped bar chart across every month
- **Friends** — search users, send/accept/decline requests, savings-rate leaderboard
- **Profile** — editable display name, pick a cute **animal avatar** (Twemoji), and delete account
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
    /lib           → utils (cn, formatters), category + avatar definitions
    /pages         → One file per page
/backend           → Express backend
  /config          → DB + Passport config
  /controllers     → Route logic
  /middleware      → Auth (JWT) + async wrapper
  /models          → Mongoose schemas
  /routes          → Express routers
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

## 🔌 API Overview

All routes except the OAuth start/callback require a `Bearer <JWT>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback → redirects with JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/home` | Homepage stats |
| PATCH | `/api/auth/profile` | Update display name / avatar |
| DELETE | `/api/auth/me` | Delete account (and all its data) |
| POST | `/api/auth/categories` | Add a custom category |
| DELETE | `/api/auth/categories/:id` | Delete a custom category |
| GET | `/api/transactions` | List transactions for current month |
| POST | `/api/transactions` | Add a transaction |
| DELETE | `/api/transactions/:id` | Delete a transaction |
| GET | `/api/summary` | Current month summary |
| GET | `/api/summary/all` | All monthly summaries |
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
- Monthly summaries are auto-recomputed whenever transactions are added or removed.
- Animal avatars are [Twemoji](https://github.com/jdecked/twemoji) (© Twitter, **CC-BY 4.0**).
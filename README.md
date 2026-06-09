# 💸 Broke No More

A full-stack budgeting web app — *know exactly how much you can spend today and how much you need to save for tomorrow.*

Built with **React + Vite**, **Node + Express**, and **MongoDB**, with Google OAuth, JWT sessions, smooth Framer Motion animations, and Recharts visualisations.

---

## ✨ Features

- **Google OAuth** sign-in (Passport.js) with JWT sessions and protected routes
- **Homepage** — accumulated savings, what's left to spend this month, animated count-up stats
- **Calculator** — daily spend budget & savings-goal calculators with animated results
- **Transactions** — add income/expenses, staggered slide-in list, live remaining balance
- **Monthly Tracker** — animated donut chart of saved vs spent (arc-by-arc fill)
- **Stats** — grouped bar chart comparing savings vs spending across every month
- **Friends** — search users, send/accept/decline requests, savings-rate leaderboard
- Premium animations throughout: page transitions, count-ups, hover lifts, fade/scale-ins

## 🧱 Tech Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, React Router v6, Tailwind CSS, shadcn-style UI, Framer Motion, Recharts, Axios |
| Backend  | Node.js, Express, Passport (Google OAuth20), JWT, Mongoose |
| Database | MongoDB 7 (via Docker) |
| Dev setup | Docker Desktop (runs MongoDB + backend + frontend together) |

---

## 📁 Project Structure

```
/client            → React frontend (Vite)
  /src
    /api           → Axios client + endpoint helpers
    /animations    → Shared Framer Motion variants
    /components    → Reusable UI (incl. /ui shadcn-style primitives)
    /hooks         → Auth context, count-up hook
    /lib           → utils (cn, formatters)
    /pages         → One file per page
/server            → Express backend
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
cp .env.example server/.env
```

Open `server/.env` and fill in these values:

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
8. Copy the **Client ID** and **Client Secret** into `server/.env`.

---

### Step 3 — Start the app

Make sure **Docker Desktop is open**, then from the project root run:

```bash
docker compose up --build
```

Wait for all three services to start. You'll know it's ready when you see:

```
client-1  |   ➜  Local:   http://localhost:5173/
server-1  | ✅ MongoDB connected: mongodb://mongo:27017/brokenomore
server-1  | 🚀 Server running on http://localhost:5000
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

- Color theme: green & white (money/savings feel), defined as CSS variables in `client/src/index.css`.
- Animation defaults: `easeOut` easing, durations between 0.4s–0.8s.
- Monthly summaries are auto-recomputed whenever transactions are added or removed.
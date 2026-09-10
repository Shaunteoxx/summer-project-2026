import crypto from "node:crypto";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Transfer from "../models/Transfer.js";
import BudgetPeriod from "../models/BudgetPeriod.js";
import BudgetTerm from "../models/BudgetTerm.js";
import MonthlySummary from "../models/MonthlySummary.js";

// Identity of the legacy single shared demo account, kept so the sweep can
// recognise and retire one left over from before demos became per-visitor.
const DEMO_GOOGLE_ID = "demo-account";
const DEMO_EMAIL = "demo@brokenomore.app";
const DEMO_USERNAME = "demo_explorer";
const DEMO_AVATAR = "panda";
const MONTHLY_SAVINGS = 200;

// Small deterministic PRNG so the seeded data is varied but reproducible.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const money = (n) => Math.round(n * 100) / 100;

const FOOD = [
  "Lunch",
  "Bubble tea",
  "Coffee",
  "Dinner with friends",
  "Groceries",
  "Breakfast",
  "Snacks",
  "Hawker centre",
];
const SHOPPING = ["New hoodie", "Stationery", "Phone case", "Sneakers", "Skincare"];
const FUN = ["Movie night", "Concert ticket", "Arcade", "Spotify", "Game on Steam"];
const TRAVEL = ["Weekend trip", "Bus to JB", "Flight deposit"];

/**
 * Build one month of realistic student transactions up to `lastDay`.
 *
 * `spendScale` multiplies expenses only. At 1 the pattern spends about a third
 * of the month's income, which reads as an implausibly good month and — more
 * to the point — leaves every day comfortably inside its budget, so a seeded
 * account shows an unbroken streak and a calendar with no red in it. Scaling up
 * is how a longer seed gets days worth looking at.
 */
function genMonth(userId, year, month, lastDay, rand, spendScale = 1, accounts = null) {
  const docs = [];
  // Income lands in the first account; day-to-day spending comes off the
  // second, which is what makes the seeded transfers necessary.
  const accountFor = (type) =>
    accounts ? (type === "income" ? accounts.income : accounts.spending) : null;
  const add = (type, category, description, amount, day) =>
    docs.push({
      userId,
      type,
      category,
      description,
      accountId: accountFor(type),
      amount: money(type === "expense" ? amount * spendScale : amount),
      // UTC midnight, matching how real transactions store "YYYY-MM-DD" dates
      // (the streak keys days by UTC, so local-midnight dates shift a day).
      date: new Date(Date.UTC(year, month, day)),
      month,
      year,
    });

  // --- Income ---
  add("income", "Allowance", "Monthly allowance", 800, 1);
  if (lastDay >= 15) add("income", "Job", "Part-time shift", 250, 15);
  if (lastDay >= 20 && rand() > 0.5) add("income", "Gifts", "Birthday money", 50, 20);

  // --- F & B: most days ---
  for (let d = 2; d <= lastDay; d += 1 + Math.floor(rand() * 2)) {
    add("expense", "F & B", pick(FOOD, rand), 4 + rand() * 9, d);
  }
  // --- Transport: a few times a week ---
  for (let d = 3; d <= lastDay; d += 3 + Math.floor(rand() * 2)) {
    add("expense", "Transport", "Bus / MRT", 1.5 + rand() * 4, d);
  }
  // --- Shopping: a couple of times ---
  if (lastDay >= 8) add("expense", "Shopping", pick(SHOPPING, rand), 18 + rand() * 35, 8);
  if (lastDay >= 23) add("expense", "Shopping", pick(SHOPPING, rand), 15 + rand() * 25, 23);
  // --- Entertainment ---
  if (lastDay >= 6) add("expense", "Entertainment", pick(FUN, rand), 10 + rand() * 18, 6);
  if (lastDay >= 18) add("expense", "Entertainment", pick(FUN, rand), 9 + rand() * 14, 18);
  // --- Travel: occasional ---
  if (lastDay >= 12 && rand() > 0.4)
    add("expense", "Travel", pick(TRAVEL, rand), 20 + rand() * 30, 12);

  return docs;
}

/**
 * Replace `user`'s transaction history with `months` of generated data, ending
 * with the current month up to today, and set a savings target on each month.
 *
 * Destructive: every existing transaction for the user is deleted first, so
 * callers seeding a real account must confirm that themselves.
 */
export async function seedHistoryFor(
  user,
  {
    months = 3,
    monthlySavings = MONTHLY_SAVINGS,
    seed = 20260614,
    spendScale = 1,
    withAccounts = false,
  } = {}
) {
  await Promise.all([
    Transaction.deleteMany({ userId: user._id }),
    Transfer.deleteMany({ userId: user._id }),
  ]);

  // Two accounts, the way someone actually splits spending: one card for
  // PayWave, another for PayNow.
  let accounts = null;
  if (withAccounts) {
    user.accounts = [
      { name: "DBS", color: "#7CB37C" },
      { name: "Trust", color: "#C26B6B" },
    ];
    accounts = {
      income: user.accounts[0]._id,
      spending: user.accounts[1]._id,
    };
  }

  const now = new Date();
  const rand = mulberry32(seed);
  // Oldest first, ending on the current month.
  const window = Array.from({ length: months }, (_, i) => months - 1 - i).map(
    (back) => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    }
  );

  const docs = [];
  const savings = {};
  for (const { year, month } of window) {
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    const lastDay = isCurrent ? now.getDate() : new Date(year, month + 1, 0).getDate();
    savings[`${year}-${month}`] = monthlySavings;
    docs.push(...genMonth(user._id, year, month, lastDay, rand, spendScale, accounts));
  }

  await Transaction.insertMany(docs);

  // Spending comes off Trust while income lands in DBS, so each month needs a
  // top-up — exactly the situation transfers exist for.
  let transfers = 0;
  if (accounts) {
    const rows = window.map(({ year, month }) => ({
      userId: user._id,
      from: accounts.income,
      to: accounts.spending,
      amount: 400,
      date: new Date(Date.UTC(year, month, 2)),
    }));
    await Transfer.insertMany(rows);
    transfers = rows.length;
  }

  user.savingsByMonth = savings;
  user.restoredDays = [];
  await user.save();

  return { user, transactions: docs.length, months: window.length, transfers };
}

/**
 * Create (or rebuild) THE shared demo account — the pre-sandbox arrangement.
 *
 * Kept for `scripts/seedDemo.js`, which exists to give a deployment something
 * to look at. Visitors no longer land here; see `createDemoUser`.
 */
export async function reseedDemoUser() {
  let user = await User.findOne({ googleId: DEMO_GOOGLE_ID });
  if (!user) {
    try {
      user = await User.create({
        googleId: DEMO_GOOGLE_ID,
        username: DEMO_USERNAME,
        email: DEMO_EMAIL,
        avatar: DEMO_AVATAR,
        isDemo: true,
      });
    } catch {
      // Lost a create race with a concurrent request — just reuse it.
      user = await User.findOne({ googleId: DEMO_GOOGLE_ID });
    }
  }

  // The current month plus the two before it.
  await seedHistoryFor(user, { months: 3 });
  return user;
}

/** How long a visitor's sandbox lives before the next demo login sweeps it. */
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

/** Every collection that stores rows against a userId. */
const OWNED_BY_USER = [Transaction, Transfer, BudgetPeriod, BudgetTerm, MonthlySummary];

/**
 * Delete expired sandboxes and everything they own.
 *
 * Called on the way into a new demo rather than from a scheduler: there is no
 * job runner in this app, and the one moment a sweep is certainly worth doing
 * is when someone is about to create another one. Failure here must never block
 * a login, so the caller swallows it.
 */
export async function sweepExpiredDemoUsers(now = new Date()) {
  const expired = await User.find({
    isDemo: true,
    demoExpiresAt: { $ne: null, $lte: now },
  })
    .select("_id")
    .lean();
  if (expired.length === 0) return 0;

  await purgeUsers(expired.map((u) => u._id));
  return expired.length;
}

/**
 * Delete these users and every row they own.
 *
 * Rows first, user last: if this dies halfway the account is still reachable
 * and the next sweep finishes the job. The other order orphans the rows.
 */
async function purgeUsers(ids) {
  if (ids.length === 0) return;
  await Promise.all(
    OWNED_BY_USER.map((Model) => Model.deleteMany({ userId: { $in: ids } }))
  );
  await User.deleteMany({ _id: { $in: ids } });
}

/**
 * Throw away one visitor's sandbox on sign-out, rather than leaving it for the
 * sweep. Refuses anything that isn't a demo account, so a stray call can never
 * delete a real one.
 */
export async function retireDemoUser(userId) {
  const user = await User.findOne({ _id: userId, isDemo: true }).select("_id").lean();
  if (!user) return false;
  await purgeUsers([user._id]);
  return true;
}

/**
 * Ceiling on how many per-session demo sandboxes may exist at once.
 *
 * The per-IP rate limit on /api/auth/demo caps how FAST accounts are created;
 * this caps how MANY accumulate — across many IPs, or within the 24h TTL
 * before the sweep collects them. Each sandbox carries three months of seeded
 * transactions, so an unbounded count is unbounded storage. Tunable via env for
 * a busier deployment; the default is generous for a demo.
 */
export const MAX_LIVE_DEMOS = Number(process.env.DEMO_MAX_LIVE) || 200;

/**
 * Keep live per-session demos under `cap`, evicting the oldest (and their data)
 * to make room rather than turning a new visitor away. Only per-session
 * accounts count — the shared demo seeded by scripts/seedDemo.js has a null
 * `demoExpiresAt` and is never touched. Oldest = smallest expiry, which tracks
 * creation order since every sandbox gets the same fixed TTL.
 */
export async function evictDemosToCap(cap = MAX_LIVE_DEMOS) {
  const q = { isDemo: true, demoExpiresAt: { $ne: null } };
  const count = await User.countDocuments(q);
  const over = count - (cap - 1); // leave room for the one about to be created
  if (over <= 0) return 0;
  const oldest = await User.find(q)
    .sort({ demoExpiresAt: 1 })
    .limit(over)
    .select("_id")
    .lean();
  await purgeUsers(oldest.map((u) => u._id));
  return oldest.length;
}

/**
 * Build one visitor their own sandbox, seeded with three months of history.
 *
 * Per-visitor because the shared account had to be read-only to stay coherent,
 * which made the demo refuse the very actions it was there to show. These are
 * disposable: `demoExpiresAt` marks them, and the sweep above collects them.
 *
 * `googleId`, `username` and `email` are all unique in the schema, so each one
 * gets a random suffix. Friend search and the leaderboard already exclude
 * `isDemo` users, so a crowd of them never shows up in either.
 */
export async function createDemoUser() {
  // Bound the total before adding one more, so a burst can't grow the table
  // without limit between sweeps.
  await evictDemosToCap();
  const tag = crypto.randomBytes(5).toString("hex");
  const user = await User.create({
    googleId: `demo-${tag}`,
    username: `demo_${tag}`,
    email: `demo+${tag}@brokenomore.app`,
    avatar: DEMO_AVATAR,
    isDemo: true,
    demoExpiresAt: new Date(Date.now() + DEMO_TTL_MS),
  });

  await seedHistoryFor(user, { months: 3 });
  return user;
}

/**
 * Return the shared demo user, seeding it on first use.
 * Only `scripts/seedDemo.js` needs this now.
 */
export async function ensureDemoUser() {
  const existing = await User.findOne({ googleId: DEMO_GOOGLE_ID });
  if (existing) return existing;
  return reseedDemoUser();
}

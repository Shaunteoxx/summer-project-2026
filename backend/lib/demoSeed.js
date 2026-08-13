import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Transfer from "../models/Transfer.js";

// Identity of the single shared, read-only demo account.
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
 * Create (or rebuild) the demo account and its data, then return the user.
 * Idempotent: wipes any existing demo transactions before reseeding.
 */
export async function reseedDemoUser() {
  let user = await User.findOne({ isDemo: true });
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
      user = await User.findOne({ isDemo: true });
    }
  }

  // The current month plus the two before it.
  await seedHistoryFor(user, { months: 3 });
  return user;
}

/** Return the demo user, seeding it on first use if it doesn't exist yet. */
export async function ensureDemoUser() {
  const existing = await User.findOne({ isDemo: true });
  if (existing) return existing;
  return reseedDemoUser();
}

import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { recomputeSummary } from "../controllers/summaryController.js";

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

// Build one month of realistic student transactions up to `lastDay`.
function genMonth(userId, year, month, lastDay, rand) {
  const docs = [];
  const add = (type, category, description, amount, day) =>
    docs.push({
      userId,
      type,
      category,
      description,
      amount: money(amount),
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

  // --- Food & Drinks: most days ---
  for (let d = 2; d <= lastDay; d += 1 + Math.floor(rand() * 2)) {
    add("expense", "Food & Drinks", pick(FOOD, rand), 4 + rand() * 9, d);
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

  await Transaction.deleteMany({ userId: user._id });

  const now = new Date();
  const rand = mulberry32(20260614);
  // Current month plus the two before it, oldest first.
  const months = [2, 1, 0].map((back) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const docs = [];
  const savings = {};
  for (const { year, month } of months) {
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    const lastDay = isCurrent ? now.getDate() : new Date(year, month + 1, 0).getDate();
    savings[`${year}-${month}`] = MONTHLY_SAVINGS;
    docs.push(...genMonth(user._id, year, month, lastDay, rand));
  }

  await Transaction.insertMany(docs);
  user.savingsByMonth = savings;
  user.restoredDays = [];
  await user.save();

  for (const { year, month } of months) {
    await recomputeSummary(user._id, month, year);
  }

  return user;
}

/** Return the demo user, seeding it on first use if it doesn't exist yet. */
export async function ensureDemoUser() {
  const existing = await User.findOne({ isDemo: true });
  if (existing) return existing;
  return reseedDemoUser();
}

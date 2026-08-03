import { env } from "../config/env.js";
import {
  MIN_YEAR,
  MAX_YEAR,
  resolveClientToday,
  roundMoney,
  ymd,
} from "../lib/validation.js";
import { dayFromYmd, daysLeftInPeriod } from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { signToken, sessionExhausted } from "../middleware/auth.js";
import { getLifetimeSavings } from "./summaryController.js";
import { ensureDemoUser } from "../lib/demoSeed.js";
import BudgetPeriod from "../models/BudgetPeriod.js";
import MonthlySummary from "../models/MonthlySummary.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";

// Avatar ids the client offers — keep in sync with frontend/src/lib/avatars.js.
const ALLOWED_AVATARS = [
  "dog",
  "cat",
  "hamster",
  "panda",
  "dragon",
  "teddybear",
  "trex",
  "pumpkin",
  "snowman",
];

/** Passport success handler -> issue JWT and bounce back to the client. */
export function googleCallback(req, res) {
  const token = signToken(req.user);
  // Hash fragment keeps the bearer token out of access logs and referrers.
  res.redirect(`${env.clientUrl}/auth/callback#token=${token}`);
}

/** POST /api/auth/demo -> log in as the shared read-only demo account. */
export async function demoLogin(req, res) {
  const user = await ensureDemoUser();
  const token = signToken(user);
  res.json({ token });
}

/**
 * POST /api/auth/refresh -> swap a still-valid token for a fresh one.
 * Keeps a session alive across app restarts, but carries the original sign-in
 * time forward so it can only be extended up to the 30-day ceiling.
 */
export function refreshSession(req, res) {
  const authAt = req.token.authAt ?? req.token.iat;
  if (sessionExhausted(authAt)) {
    return res.status(401).json({ message: "Session expired, please sign in again" });
  }
  res.json({ token: signToken(req.user, authAt) });
}

/**
 * POST /api/auth/logout -> invalidate every token issued to this user.
 * Bumping tokenVersion is what makes signing out real: without it, clearing the
 * client's copy left the token usable by anyone who had captured it.
 */
export async function logout(req, res) {
  // The demo account is shared, so bumping its version would sign out everyone
  // else exploring the demo. Clearing the client's token is enough there.
  if (!req.user.isDemo) {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  }
  res.json({ message: "Signed out" });
}

/** GET /api/auth/me -> current user profile (used by the client to bootstrap). */
export async function getMe(req, res) {
  const user = req.user;
  res.json({
    id: user._id,
    username: user.username,
    email: user.email,
    isDemo: !!user.isDemo,
    profilePicture: user.profilePicture,
    avatar: user.avatar,
    budgetMode: user.budgetMode || "month",
    savingsByMonth: Object.fromEntries(user.savingsByMonth || []),
    friends: user.friends,
    friendRequests: user.friendRequests,
    customCategories: (user.customCategories || []).map((c) => ({
      id: c._id,
      name: c.name,
      type: c.type,
      color: c.color,
    })),
    createdAt: user.createdAt,
  });
}

// Built-in category names — custom categories may not collide with these.
const FIXED_CATEGORY_NAMES = [
  "Food & Drinks",
  "Transport",
  "Shopping",
  "Entertainment",
  "Travel",
  "Allowance",
  "Job",
  "Gifts",
];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_CUSTOM_CATEGORIES = 20;

/** POST /api/auth/categories -> add a custom category for the current user. */
export async function addCategory(req, res) {
  const user = req.user;
  const name = String(req.body.name || "").trim();
  const { type, color } = req.body;

  if (!name || !type || !color) {
    return res.status(400).json({ message: "name, type and color are required" });
  }
  if (!["income", "expense"].includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }
  if (!HEX_COLOR.test(color)) {
    return res.status(400).json({ message: "Invalid color" });
  }
  if (name.length > 24) {
    return res.status(400).json({ message: "Name too long (max 24 characters)" });
  }

  const lc = name.toLowerCase();
  const clashes =
    FIXED_CATEGORY_NAMES.some((n) => n.toLowerCase() === lc) ||
    user.customCategories.some((c) => c.name.toLowerCase() === lc);
  if (clashes) {
    return res.status(409).json({ message: "That category already exists" });
  }
  if (user.customCategories.length >= MAX_CUSTOM_CATEGORIES) {
    return res.status(400).json({ message: "Category limit reached" });
  }

  user.customCategories.push({ name, type, color });
  await user.save();
  const created = user.customCategories[user.customCategories.length - 1];
  res.status(201).json({
    id: created._id,
    name: created.name,
    type: created.type,
    color: created.color,
  });
}

/** DELETE /api/auth/categories/:id -> remove one of the user's custom categories. */
export async function removeCategory(req, res) {
  const user = req.user;
  const sub = user.customCategories.id(req.params.id);
  if (!sub) {
    return res.status(404).json({ message: "Category not found" });
  }
  user.customCategories.pull(req.params.id);
  await user.save();
  res.json({ message: "Deleted", id: req.params.id });
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** PATCH /api/auth/profile -> update display name and/or avatar. */
export async function updateProfile(req, res) {
  const user = req.user;
  const { username, avatar } = req.body;

  if (username !== undefined) {
    const name = String(username).trim();
    if (!USERNAME_RE.test(name)) {
      return res.status(400).json({
        message: "Username must be 3–20 letters, numbers or underscores",
      });
    }
    const existing = await User.findOne({
      _id: { $ne: user._id },
      $or: [
        { usernameKey: name.toLowerCase() },
        { username: { $regex: `^${name}$`, $options: "i" } },
      ],
    });
    if (existing) {
      return res.status(409).json({ message: "That username is taken" });
    }
    user.username = name;
  }

  if (avatar !== undefined) {
    if (avatar !== "" && !ALLOWED_AVATARS.includes(avatar)) {
      return res.status(400).json({ message: "Invalid avatar" });
    }
    user.avatar = avatar;
  }

  await user.save();
  res.json({ id: user._id, username: user.username, avatar: user.avatar });
}

const SAVINGS_KEY_RE = /^\d{4}-(0|1[01]|[0-9])$/;

/** PUT /api/auth/savings { key: "YYYY-M", amount } -> set one month's savings. */
export async function setSavings(req, res) {
  const user = req.user;
  const { key, amount } = req.body;

  if (!SAVINGS_KEY_RE.test(key || "")) {
    return res.status(400).json({ message: "Invalid month" });
  }
  const [year] = key.split("-").map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return res.status(400).json({ message: "Invalid month" });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 1e9) {
    return res.status(400).json({ message: "Invalid savings amount" });
  }
  const value = roundMoney(numericAmount);

  if (value === 0) user.savingsByMonth.delete(key);
  else user.savingsByMonth.set(key, value);
  await user.save();

  res.json({ savingsByMonth: Object.fromEntries(user.savingsByMonth) });
}

/** DELETE /api/auth/me -> permanently delete the account and all its data. */
export async function deleteAccount(req, res) {
  const userId = req.user._id;

  // Clean up in parallel; the user doc goes last so a partial failure
  // leaves the account intact and the delete retryable.
  await Promise.all([
    Transaction.deleteMany({ userId }),
    MonthlySummary.deleteMany({ userId }),
    BudgetPeriod.deleteMany({ userId }),
    // Scrub references to this user from everyone else's friends / requests.
    User.updateMany(
      { $or: [{ friends: userId }, { friendRequests: userId }] },
      { $pull: { friends: userId, friendRequests: userId } }
    ),
  ]);

  await User.deleteOne({ _id: userId });
  res.json({ message: "Account deleted" });
}

/** GET /api/auth/home -> aggregated homepage stats for the active period. */
export async function getHomeStats(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const todayKey = ymd(today);

  const context = await loadPeriodContext(req.user, todayKey);
  const active = context.active;

  // In days mode there may be no period running — between two of them, or
  // before the first is started. There's nothing to budget, so the client gets
  // a null period and shows a "start a period" prompt instead of numbers.
  const [periodTransactions, totalSavings] = await Promise.all([
    active
      ? Transaction.find({
          userId: req.user._id,
          date: { $gte: dayFromYmd(active.start), $lte: dayFromYmd(active.end) },
        })
      : [],
    getLifetimeSavings(req.user._id),
  ]);

  let income = 0;
  let expenses = 0;
  for (const t of periodTransactions) {
    if (t.type === "income") income += t.amount;
    else expenses += t.amount;
  }

  income = roundMoney(income);
  expenses = roundMoney(expenses);

  // Reserve the period's savings target before working out what's left to
  // spend, so the headline matches the daily-budget model.
  const periodSavings = roundMoney(active?.savings ?? 0);

  // "Left to spend" = income this period minus expenses so far minus the
  // savings set aside. Can go negative if you've overspent your target.
  const leftToSpend = roundMoney(income - expenses - periodSavings);

  res.json({
    username: req.user.username,
    mode: context.mode,
    status: context.status,
    period: active
      ? {
          id: active.id,
          start: active.start,
          end: active.end,
          days: active.days,
          daysLeft: daysLeftInPeriod(todayKey, active),
        }
      : null,
    periodIncome: income,
    periodExpenses: expenses,
    periodSavings,
    leftToSpend,
    totalSavings,
    percentageSaved:
      income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
  });
}

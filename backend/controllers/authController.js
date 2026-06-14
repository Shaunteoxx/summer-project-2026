import { signToken } from "../middleware/auth.js";
import { getLifetimeSavings } from "./summaryController.js";
import { ensureDemoUser } from "../lib/demoSeed.js";
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

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

/** Passport success handler -> issue JWT and bounce back to the client. */
export function googleCallback(req, res) {
  const token = signToken(req.user);
  res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
}

/** POST /api/auth/demo -> log in as the shared read-only demo account. */
export async function demoLogin(req, res) {
  const user = await ensureDemoUser();
  const token = signToken(user);
  res.json({ token });
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
      username: { $regex: `^${name}$`, $options: "i" },
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
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    return res.status(400).json({ message: "Invalid savings amount" });
  }

  if (value === 0) user.savingsByMonth.delete(key);
  else user.savingsByMonth.set(key, value);
  await user.save();

  res.json({ savingsByMonth: Object.fromEntries(user.savingsByMonth) });
}

/** DELETE /api/auth/me -> permanently delete the account and all its data. */
export async function deleteAccount(req, res) {
  const userId = req.user._id;

  await Transaction.deleteMany({ userId });
  await MonthlySummary.deleteMany({ userId });

  // Scrub references to this user from everyone else's friends / requests.
  await User.updateMany(
    { $or: [{ friends: userId }, { friendRequests: userId }] },
    { $pull: { friends: userId, friendRequests: userId } }
  );

  await User.deleteOne({ _id: userId });
  res.json({ message: "Account deleted" });
}

/** GET /api/auth/home -> aggregated homepage stats for the current month. */
export async function getHomeStats(req, res) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const monthTransactions = await Transaction.find({
    userId: req.user._id,
    month,
    year,
  });

  let income = 0;
  let expenses = 0;
  for (const t of monthTransactions) {
    if (t.type === "income") income += t.amount;
    else expenses += t.amount;
  }

  const summary = await MonthlySummary.findOne({
    userId: req.user._id,
    month,
    year,
  });

  const totalSavings = await getLifetimeSavings(req.user._id);

  // "Left to spend" = income recorded this month minus expenses recorded so far.
  const leftToSpend = income - expenses;

  res.json({
    username: req.user.username,
    month,
    year,
    monthIncome: income,
    monthExpenses: expenses,
    leftToSpend,
    totalSavings,
    percentageSaved: summary?.percentageSaved ?? 0,
  });
}

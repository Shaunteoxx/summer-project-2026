import { env } from "../config/env.js";
import {
  MIN_YEAR,
  MAX_YEAR,
  parseYmd,
  resolveClientToday,
  roundMoney,
  utcToday,
  ymd,
} from "../lib/validation.js";
import { addDays, dayFromYmd, daysLeftInPeriod } from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";
import { ensureRecurringDue } from "../lib/recurring.js";
// Repeating rules describe entries, so their fields obey the same rules the
// transaction endpoints apply — one definition, in lib/entryFields.js.
import {
  FIXED_CATEGORY_NAMES,
  checkAccountId,
  checkAmount,
  checkCategory,
  checkDescription,
  checkType,
} from "../lib/entryFields.js";
import { signToken, sessionExhausted } from "../middleware/auth.js";
import { getLifetimeSavings } from "./summaryController.js";
import { ensureDemoUser } from "../lib/demoSeed.js";
import BudgetPeriod from "../models/BudgetPeriod.js";
import MonthlySummary from "../models/MonthlySummary.js";
import Transaction from "../models/Transaction.js";
import Transfer from "../models/Transfer.js";
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

/** Shape sent to the client; the id is what transactions store. */
const presentAccount = (a) => ({
  id: a._id,
  name: a.name,
  color: a.color,
  archived: !!a.archived,
});

/** GET /api/auth/me -> current user profile (used by the client to bootstrap). */
export async function getMe(req, res) {
  const user = req.user;
  // Carry here as well as on /streak and /period, because the transactions
  // page reads the target straight off this payload. Server today is enough:
  // it only picks which month key to fill, and a client an hour the other side
  // of the boundary fills the next key with the same value on its own call.
  await ensureCurrentMonthSavings(user, ymd(utcToday()));
  await ensureRecurringDue(user, ymd(utcToday()));
  res.json({
    id: user._id,
    username: user.username,
    email: user.email,
    isDemo: !!user.isDemo,
    profilePicture: user.profilePicture,
    avatar: user.avatar,
    budgetMode: user.budgetMode || "month",
    accounts: (user.accounts || []).map(presentAccount),
    recurring: (user.recurring || []).map(presentRule),
    savingsByMonth: Object.fromEntries(user.savingsByMonth || []),
    repeatSavings: !!user.repeatSavings,
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

// Enough for the accounts a person actually spends from, and few enough that
// the picker in the add sheet stays a chip row rather than a scrolling list.
const MAX_ACCOUNTS = 8;

/** POST /api/auth/accounts { name, color } -> create a bank account. */
export async function addAccount(req, res) {
  const user = req.user;
  const name = String(req.body.name || "").trim();
  const { color } = req.body;

  if (!name || !color) {
    return res.status(400).json({ message: "name and color are required" });
  }
  if (name.length > 24) {
    return res.status(400).json({ message: "Name too long (max 24 characters)" });
  }
  if (!HEX_COLOR.test(color)) {
    return res.status(400).json({ message: "Invalid color" });
  }

  const lc = name.toLowerCase();
  if (user.accounts.some((a) => a.name.toLowerCase() === lc)) {
    return res.status(409).json({ message: "That account already exists" });
  }
  // Archived accounts keep their history but shouldn't count against the limit.
  if (user.accounts.filter((a) => !a.archived).length >= MAX_ACCOUNTS) {
    return res.status(400).json({ message: "Account limit reached" });
  }

  user.accounts.push({ name, color });
  await user.save();
  res.status(201).json(presentAccount(user.accounts[user.accounts.length - 1]));
}

/** PATCH /api/auth/accounts/:id { name?, color?, archived? } */
export async function updateAccount(req, res) {
  const user = req.user;
  const account = user.accounts.id(req.params.id);
  if (!account) return res.status(404).json({ message: "Account not found" });

  const { name, color, archived } = req.body;

  if (name !== undefined) {
    const next = String(name).trim();
    if (!next) return res.status(400).json({ message: "name is required" });
    if (next.length > 24) {
      return res.status(400).json({ message: "Name too long (max 24 characters)" });
    }
    const lc = next.toLowerCase();
    const clash = user.accounts.some(
      (a) => String(a._id) !== String(account._id) && a.name.toLowerCase() === lc
    );
    if (clash) return res.status(409).json({ message: "That account already exists" });
    account.name = next;
  }

  if (color !== undefined) {
    if (!HEX_COLOR.test(color)) {
      return res.status(400).json({ message: "Invalid color" });
    }
    account.color = color;
  }

  if (archived !== undefined) {
    if (typeof archived !== "boolean") {
      return res.status(400).json({ message: "Invalid archived flag" });
    }
    // Un-archiving has to respect the limit too, or it becomes a way past it.
    if (!archived && user.accounts.filter((a) => !a.archived).length >= MAX_ACCOUNTS) {
      return res.status(400).json({ message: "Account limit reached" });
    }
    account.archived = archived;
  }

  await user.save();
  res.json(presentAccount(account));
}

/**
 * DELETE /api/auth/accounts/:id
 *
 * Only for accounts with nothing behind them. Deleting one that has history
 * would orphan its transactions — they would keep an accountId pointing at
 * nothing, and quietly drop out of the per-account totals while still counting
 * towards the budget. Archiving is the answer for those.
 */
export async function removeAccount(req, res) {
  const user = req.user;
  const account = user.accounts.id(req.params.id);
  if (!account) return res.status(404).json({ message: "Account not found" });

  const [txns, transfers] = await Promise.all([
    Transaction.countDocuments({ userId: user._id, accountId: account._id }),
    Transfer.countDocuments({
      userId: user._id,
      $or: [{ from: account._id }, { to: account._id }],
    }),
  ]);
  if (txns + transfers > 0) {
    return res.status(409).json({
      message: "This account has history. Archive it instead of deleting it.",
      inUse: true,
    });
  }
  // A repeating entry pointing at a deleted account would keep producing
  // transactions tagged to nothing — invisible in the per-account totals while
  // still counting against the budget.
  if ((user.recurring || []).some((r) => String(r.accountId) === String(account._id))) {
    return res.status(409).json({
      message: "A repeating entry uses this account. Archive it instead.",
      inUse: true,
    });
  }

  user.accounts.pull(req.params.id);
  await user.save();
  res.json({ message: "Deleted", id: req.params.id });
}

// Enough for a rent, a phone bill and every subscription a person actually
// keeps, without the list on the More page turning into something to scroll.
const MAX_RECURRING = 20;

/** Shape sent to the client. */
const presentRule = (r) => ({
  id: r._id,
  description: r.description,
  amount: r.amount,
  type: r.type,
  category: r.category,
  accountId: r.accountId ? String(r.accountId) : null,
  frequency: r.frequency,
  dayOfMonth: r.dayOfMonth ?? null,
  weekday: r.weekday ?? null,
  startKey: r.startKey,
  lastRunKey: r.lastRunKey ?? null,
  paused: !!r.paused,
});

/**
 * Validate the fields a rule shares with a transaction, plus its schedule.
 * `base` supplies the current values when patching, so a partial update is
 * checked as a whole — changing only the type has to re-check the category
 * against it, or the rule starts producing entries the API would refuse.
 */
function checkRule(user, body, base = {}) {
  const merged = { ...base, ...body };

  // The first four are exactly a transaction's fields, checked by exactly the
  // same code — a rule that accepted something transactions refuse would sit
  // there producing entries the API would reject.
  const description = checkDescription(merged.description);
  if (description.message) return { message: description.message };

  const type = checkType(merged.type);
  if (type.message) return { message: type.message };

  const amount = checkAmount(merged.amount);
  if (amount.message) return { message: amount.message };

  const category = checkCategory(user, merged.type, merged.category);
  if (category.message) return { message: category.message };

  if (!["monthly", "weekly"].includes(merged.frequency)) {
    return { message: "Choose monthly or weekly" };
  }

  let dayOfMonth = null;
  let weekday = null;
  if (merged.frequency === "monthly") {
    dayOfMonth = Number(merged.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { message: "Choose a day of the month between 1 and 31" };
    }
  } else {
    weekday = Number(merged.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { message: "Choose a day of the week" };
    }
  }

  const account = checkAccountId(user, merged.accountId);
  if (!account.ok) return { message: "Choose a valid account" };

  return {
    value: {
      description: description.value,
      amount: amount.value,
      type: type.value,
      category: category.value,
      accountId: account.value,
      frequency: merged.frequency,
      dayOfMonth,
      weekday,
    },
  };
}

/**
 * POST /api/auth/recurring -> create a repeating entry.
 *
 * `startKey` may be today or later, never earlier. A rule that back-filled
 * would write transactions into days the user has already lived through,
 * retroactively changing their daily budgets and their streak — the same trap
 * lib/savingsCarry.js exists to avoid. Past entries are added by hand.
 */
export async function addRecurring(req, res) {
  const user = req.user;
  const checked = checkRule(user, req.body);
  if (checked.message) return res.status(400).json({ message: checked.message });

  const todayKey = ymd(utcToday());
  const startKey = req.body.startKey ? parseYmd(req.body.startKey) : utcToday();
  if (!startKey) return res.status(400).json({ message: "Invalid start date" });

  // The client sends its own local date, which can legitimately read a day
  // behind the server's UTC date for anyone west of it. A day of skew is
  // timezone, not intent, so it clamps up to today rather than being refused;
  // anything older is a real attempt to back-date and is turned away.
  let startYmd = ymd(startKey);
  if (startYmd < todayKey) {
    if (startYmd < ymd(addDays(utcToday(), -1))) {
      return res.status(400).json({
        message: "A repeating entry can only start today or later.",
      });
    }
    startYmd = todayKey;
  }

  if (user.recurring.length >= MAX_RECURRING) {
    return res.status(400).json({ message: "Repeating entry limit reached" });
  }

  user.recurring.push({ ...checked.value, startKey: startYmd });
  await user.save();
  res.status(201).json(presentRule(user.recurring[user.recurring.length - 1]));
}

/**
 * PATCH /api/auth/recurring/:id
 *
 * Edits apply to what the rule produces next. Entries it has already written
 * are ordinary transactions and are left exactly as they are — putting up the
 * rent changes future rent, not the rent you already paid.
 */
export async function updateRecurring(req, res) {
  const user = req.user;
  const rule = user.recurring.id(req.params.id);
  if (!rule) return res.status(404).json({ message: "Repeating entry not found" });

  const { paused } = req.body;
  const editable = { ...req.body };
  delete editable.paused;
  delete editable.startKey;

  if (Object.keys(editable).length > 0) {
    const checked = checkRule(user, editable, {
      description: rule.description,
      amount: rule.amount,
      type: rule.type,
      category: rule.category,
      accountId: rule.accountId,
      frequency: rule.frequency,
      dayOfMonth: rule.dayOfMonth,
      weekday: rule.weekday,
    });
    if (checked.message) return res.status(400).json({ message: checked.message });
    Object.assign(rule, checked.value);
  }

  if (paused !== undefined) {
    if (typeof paused !== "boolean") {
      return res.status(400).json({ message: "Invalid paused flag" });
    }
    // Resuming picks up from today rather than back-filling the pause: those
    // entries genuinely didn't happen while it was switched off.
    if (rule.paused && !paused) rule.lastRunKey = ymd(utcToday());
    rule.paused = paused;
  }

  await user.save();
  res.json(presentRule(rule));
}

/**
 * DELETE /api/auth/recurring/:id
 *
 * Unlike an account, a rule can always be deleted. Nothing points back at it:
 * the transactions it produced are complete on their own and stay in the
 * ledger, which is what you want when you cancel a subscription — the months
 * you did pay for still happened.
 */
export async function removeRecurring(req, res) {
  const user = req.user;
  const rule = user.recurring.id(req.params.id);
  if (!rule) return res.status(404).json({ message: "Repeating entry not found" });

  user.recurring.pull(req.params.id);
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

/**
 * PUT /api/auth/savings { key: "YYYY-M", amount, repeat? } -> set one month's
 * savings target, and optionally carry it into future months.
 */
export async function setSavings(req, res) {
  const user = req.user;
  const { key, amount, repeat } = req.body;

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
  if (repeat !== undefined && typeof repeat !== "boolean") {
    return res.status(400).json({ message: "Invalid repeat flag" });
  }
  const value = roundMoney(numericAmount);

  // Zero is stored rather than deleted. Carrying a target forward has to be
  // able to tell "I want to save nothing this month" from "I haven't set this
  // month yet" — deleting the key collapses the two, and the carry would
  // overwrite a deliberate zero with last month's number.
  user.savingsByMonth.set(key, value);
  if (repeat !== undefined) user.repeatSavings = repeat;
  await user.save();

  res.json({
    savingsByMonth: Object.fromEntries(user.savingsByMonth),
    repeatSavings: user.repeatSavings,
  });
}

/** DELETE /api/auth/me -> permanently delete the account and all its data. */
export async function deleteAccount(req, res) {
  const userId = req.user._id;

  // Clean up in parallel; the user doc goes last so a partial failure
  // leaves the account intact and the delete retryable.
  await Promise.all([
    Transaction.deleteMany({ userId }),
    Transfer.deleteMany({ userId }),
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

  await ensureRecurringDue(req.user, todayKey);
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

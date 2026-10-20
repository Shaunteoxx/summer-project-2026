import { env } from "../config/env.js";
import { utcToday, ymd } from "../lib/validation.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";
import { ensureRecurringDue } from "../lib/recurring.js";
import { signToken, sessionExhausted } from "../middleware/auth.js";
import {
  createDemoUser,
  loadDemoSample,
  retireDemoUser,
  sweepExpiredDemoUsers,
} from "../lib/demoSeed.js";
import { isValidTimeZone } from "../lib/localTime.js";
import { presentAccount } from "./accountController.js";
import { presentRule } from "./recurringController.js";
import BudgetPeriod from "../models/BudgetPeriod.js";
import MonthlySummary from "../models/MonthlySummary.js";
import PushSubscription from "../models/PushSubscription.js";
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

/**
 * POST /api/auth/demo -> start a private, writable sandbox and sign into it.
 *
 * Each visitor gets their own account, so the demo can be used rather than only
 * looked at. It starts empty; sample history is one request away, below. It is
 * disposable: signing out deletes it, and any left behind are swept here on the
 * way in rather than on the reminder scheduler, which only runs when push is
 * configured, and the moment someone asks for a new sandbox is the one time a
 * sweep is certainly worth doing. A failed sweep must never cost a visitor their demo, so it is
 * deliberately not awaited into the failure path.
 */
export async function demoLogin(req, res) {
  try {
    await sweepExpiredDemoUsers();
  } catch (err) {
    console.error("Demo sweep failed", { message: err.message });
  }
  const user = await createDemoUser();
  const token = signToken(user);
  res.json({ token });
}

/**
 * POST /api/auth/demo/sample { replace? } -> fill the sandbox with sample history.
 *
 * Loading replaces every transaction and transfer, so if the visitor has
 * already logged any, it answers 409 with how many and waits to be asked again
 * with `replace: true`. The count comes from here rather than the client, which
 * only ever holds one period's worth of the ledger.
 */
export async function demoSample(req, res) {
  const user = req.user;
  if (!user.isDemo) {
    return res.status(403).json({ message: "Sample data is only available in the demo" });
  }

  if (req.body?.replace !== true) {
    const [transactions, transfers] = await Promise.all([
      Transaction.countDocuments({ userId: user._id }),
      Transfer.countDocuments({ userId: user._id }),
    ]);
    const existing = transactions + transfers;
    if (existing > 0) {
      return res
        .status(409)
        .json({ message: "Loading sample data replaces your entries", existing });
    }
  }

  const { transactions } = await loadDemoSample(user);
  res.json({ message: "Sample data loaded", transactions });
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
  // A demo account belongs to one visitor and one session. Signing out is the
  // end of both, so it goes now rather than waiting for the sweep — which is
  // also the promise the sign-in screen makes about the demo resetting.
  if (req.user.isDemo) {
    await retireDemoUser(req.user._id);
    return res.json({ message: "Signed out" });
  }
  // Signing out ends every session, so every device stops getting
  // notifications too; otherwise whoever signs in next on a shared browser
  // inherits them.
  await PushSubscription.deleteMany({ userId: req.user._id });
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ message: "Signed out" });
}

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
    demoSampleLoaded: !!user.demoSampleLoaded,
    profilePicture: user.profilePicture,
    avatar: user.avatar,
    budgetMode: user.budgetMode || "month",
    accounts: (user.accounts || []).map(presentAccount),
    recurring: (user.recurring || []).map(presentRule),
    savingsByMonth: Object.fromEntries(user.savingsByMonth || []),
    repeatSavings: !!user.repeatSavings,
    timezone: user.timezone || "",
    // Local hours only. Whether a notification is on is per device; the
    // client asks /api/push/subscription for its own.
    notificationHours: {
      dailyReminder: user.notifications?.dailyReminder?.hour ?? env.dailyReminderHour,
      morningBudget: user.notifications?.morningBudget?.hour ?? env.morningBudgetHour,
    },
    friends: user.friends,
    friendRequests: user.friendRequests,
    customCategories: (user.customCategories || []).map((c) => ({
      id: c._id,
      name: c.name,
      type: c.type,
      color: c.color,
    })),
    tours: user.tours || [],
    toursOff: !!user.toursOff,
    createdAt: user.createdAt,
  });
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** PATCH /api/auth/profile -> update display name and/or avatar. */
export async function updateProfile(req, res) {
  const user = req.user;
  const { username, avatar, timezone, toursOff } = req.body;

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

  if (timezone !== undefined) {
    if (!isValidTimeZone(timezone)) {
      return res.status(400).json({ message: "Invalid time zone" });
    }
    user.timezone = timezone;
  }

  if (toursOff !== undefined) {
    if (typeof toursOff !== "boolean") {
      return res.status(400).json({ message: "toursOff must be true or false" });
    }
    user.toursOff = toursOff;
  }

  await user.save();
  res.json({
    id: user._id,
    username: user.username,
    avatar: user.avatar,
    timezone: user.timezone,
    toursOff: !!user.toursOff,
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
    PushSubscription.deleteMany({ userId }),
    // Scrub references to this user from everyone else's friends / requests.
    User.updateMany(
      { $or: [{ friends: userId }, { friendRequests: userId }] },
      { $pull: { friends: userId, friendRequests: userId } }
    ),
  ]);

  await User.deleteOne({ _id: userId });
  res.json({ message: "Account deleted" });
}

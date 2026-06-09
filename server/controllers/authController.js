import { signToken } from "../middleware/auth.js";
import { getLifetimeSavings } from "./summaryController.js";
import MonthlySummary from "../models/MonthlySummary.js";
import Transaction from "../models/Transaction.js";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

/** Passport success handler -> issue JWT and bounce back to the client. */
export function googleCallback(req, res) {
  const token = signToken(req.user);
  res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
}

/** GET /api/auth/me -> current user profile (used by the client to bootstrap). */
export async function getMe(req, res) {
  const user = req.user;
  res.json({
    id: user._id,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    friends: user.friends,
    friendRequests: user.friendRequests,
    createdAt: user.createdAt,
  });
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
    if (t.category === "income") income += t.amount;
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

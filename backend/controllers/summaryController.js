import Transaction from "../models/Transaction.js";
import { parseMonthYear, resolveClientToday, roundMoney, ymd } from "../lib/validation.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { lifetimeSavings } from "../lib/lifetime.js";
import { SPENT_AMOUNT } from "../lib/entryFields.js";

function toSummary(row, userId, month, year) {
  const totalIncome = roundMoney(row?.totalIncome || 0);
  const totalExpenses = roundMoney(row?.totalExpenses || 0);
  const totalSaved = roundMoney(totalIncome - totalExpenses);
  return {
    userId,
    month: row?._id?.month ?? month,
    year: row?._id?.year ?? year,
    totalIncome,
    totalExpenses,
    totalSaved,
    percentageSaved: totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 100) : 0,
    percentageSpent: totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0,
  };
}

export async function aggregateSummaries(userId, match = {}) {
  return Transaction.aggregate([
    { $match: { userId, ...match } },
    {
      $group: {
        _id: { year: "$year", month: "$month" },
        totalIncome: {
          $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
        },
        totalExpenses: {
          $sum: { $cond: [{ $eq: ["$type", "expense"] }, SPENT_AMOUNT, 0] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
}

/** GET /api/summary?month=&year= */
export async function getMonthlySummary(req, res) {
  const period = parseMonthYear(req.query);
  if (!period) return res.status(400).json({ message: "Invalid month or year" });
  const { month, year } = period;
  const [row] = await aggregateSummaries(req.user._id, { month, year });
  res.json(toSummary(row, req.user._id, month, year));
}

/** GET /api/summary/all */
export async function getAllSummaries(req, res) {
  const rows = await aggregateSummaries(req.user._id);
  res.json(rows.map((row) => toSummary(row, req.user._id)));
}

/**
 * GET /api/summary/lifetime?today= -> all-time earned/spent/saved.
 *
 * Separate from /summary/all because the two answer different questions. That
 * one is a per-calendar-month history and has to stay whole, running month
 * included, or the chart and the breakdown lose their last bar. These totals
 * stop at the window still running — see lib/lifetime.js — which in days and
 * term mode isn't a month boundary at all, so it can't be derived by dropping
 * a row from the other.
 */
export async function getLifetimeSummary(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const context = await loadPeriodContext(req.user, ymd(today));
  res.json(await lifetimeSavings(req.user, context));
}

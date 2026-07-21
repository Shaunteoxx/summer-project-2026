import Transaction from "../models/Transaction.js";
import { parseMonthYear, roundMoney } from "../lib/validation.js";

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
          $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
}

/** Compatibility helper used by demo seeding; summaries are now computed, not cached. */
export async function recomputeSummary(userId, month, year) {
  const [row] = await aggregateSummaries(userId, { month, year });
  return toSummary(row, userId, month, year);
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

export async function getLifetimeSavings(userId) {
  const rows = await aggregateSummaries(userId);
  return roundMoney(
    rows.reduce((total, row) => total + row.totalIncome - row.totalExpenses, 0)
  );
}
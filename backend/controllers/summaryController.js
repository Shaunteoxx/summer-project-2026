import Transaction from "../models/Transaction.js";
import MonthlySummary from "../models/MonthlySummary.js";

/**
 * Recompute (and upsert) the MonthlySummary for a given user/month/year
 * from the underlying transactions. Called whenever transactions change.
 */
export async function recomputeSummary(userId, month, year) {
  const transactions = await Transaction.find({ userId, month, year });

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const t of transactions) {
    if (t.type === "income") totalIncome += t.amount;
    else totalExpenses += t.amount;
  }

  const totalSaved = totalIncome - totalExpenses;
  const percentageSaved =
    totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 100) : 0;
  const percentageSpent =
    totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0;

  const summary = await MonthlySummary.findOneAndUpdate(
    { userId, month, year },
    {
      userId,
      month,
      year,
      totalIncome,
      totalExpenses,
      totalSaved,
      percentageSaved,
      percentageSpent,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return summary;
}

/** GET /api/summary?month=&year=  -> single month (defaults to current month) */
export async function getMonthlySummary(req, res) {
  const now = new Date();
  const month =
    req.query.month !== undefined ? Number(req.query.month) : now.getMonth();
  const year =
    req.query.year !== undefined ? Number(req.query.year) : now.getFullYear();

  const summary = await recomputeSummary(req.user._id, month, year);
  res.json(summary);
}

/** GET /api/summary/all -> every month with data, oldest first */
export async function getAllSummaries(req, res) {
  const summaries = await MonthlySummary.find({ userId: req.user._id }).sort({
    year: 1,
    month: 1,
  });
  res.json(summaries);
}

/** Total accumulated savings since sign-up (sum of all monthly totalSaved). */
export async function getLifetimeSavings(userId) {
  const summaries = await MonthlySummary.find({ userId });
  return summaries.reduce((acc, s) => acc + s.totalSaved, 0);
}

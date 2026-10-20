import Transaction from "../models/Transaction.js";
import { resolveClientToday, roundMoney, ymd } from "../lib/validation.js";
import { dayFromYmd, daysLeftInPeriod } from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureRecurringDue } from "../lib/recurring.js";
import { grossOf, leftToSpendOf, sumEntries } from "../lib/budget.js";

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
  const periodTransactions = active
    ? await Transaction.find({
        userId: req.user._id,
        date: { $gte: dayFromYmd(active.start), $lte: dayFromYmd(active.end) },
      })
    : [];

  const { income, spent: expenses } = sumEntries(periodTransactions);

  // Reserve the period's savings target before working out what's left to
  // spend, so the headline matches the daily-budget model.
  const periodSavings = roundMoney(active?.savings ?? 0);

  // In term mode the window's money is its slice of the lump sum, not the
  // income that happens to have landed inside it — which for every cycle after
  // the first is none. Null everywhere else, so nothing changes there.
  const periodFunding = active?.funding ?? null;
  const budget = grossOf({ income, funding: periodFunding });
  const leftToSpend = leftToSpendOf({
    income,
    funding: periodFunding,
    spent: expenses,
    savings: periodSavings,
  });

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
          // Term mode only: which cycle of the term this is, for "month 2 of 6".
          cycle: active.index === undefined ? null : active.index + 1,
          cycles: active.cycles ?? null,
        }
      : null,
    periodIncome: income,
    periodFunding,
    periodExpenses: expenses,
    periodSavings,
    leftToSpend,
    percentageSaved:
      budget > 0 ? Math.round(((budget - expenses) / budget) * 100) : 0,
  });
}

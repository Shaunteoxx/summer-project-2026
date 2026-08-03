import BudgetPeriod from "../models/BudgetPeriod.js";
import { createPeriodResolver, latestPeriodBefore, periodStatus } from "./period.js";

/**
 * Everything the request handlers need to talk about periods: the user's mode,
 * their stored periods (days mode only), a resolver, and where today sits.
 *
 * Kept separate from lib/period.js so that module stays pure and testable
 * without a database.
 */
export async function loadPeriodContext(user, todayYmd) {
  const mode = user.budgetMode === "days" ? "days" : "month";
  const savingsByMonth = Object.fromEntries(user.savingsByMonth || []);
  const periods =
    mode === "days"
      ? await BudgetPeriod.find({ userId: user._id }).sort({ start: 1 }).lean()
      : [];

  const resolve = createPeriodResolver({ mode, savingsByMonth, periods });
  const active = resolve(todayYmd);

  return {
    mode,
    savingsByMonth,
    periods,
    resolve,
    active,
    status: periodStatus(todayYmd, active, periods),
    // Only set when lapsed — lets the client say which period just ended.
    previous: active ? null : latestPeriodBefore(todayYmd, periods),
  };
}

/** The shape the client gets for the active (or just-ended) period. */
export function describePeriod(context, todayYmd) {
  const p = context.active ?? context.previous;
  if (!p) return { mode: context.mode, status: context.status, current: null };
  return {
    mode: context.mode,
    status: context.status,
    current: {
      id: p.id,
      start: p.start,
      end: p.end,
      days: p.days,
      savings: p.savings,
    },
  };
}

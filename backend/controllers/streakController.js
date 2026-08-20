import Transaction from "../models/Transaction.js";
import { parseYmd, resolveClientToday, roundMoney } from "../lib/validation.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";
import { ensureRecurringDue } from "../lib/recurring.js";
import {
  addDays,
  createPeriodResolver,
  daysLeftInPeriod,
  savesForPeriod,
  ymdOf as ymd,
} from "../lib/period.js";

const MAX_STREAK_DAYS = 3660;

const dayFromYmd = (s) => new Date(`${s}T00:00:00.000Z`);

/**
 * Compute the daily-budget streak from a user's transaction history.
 *
 * Daily budget for a day = (that period's income − savings target − expenses
 * earlier in the period) ÷ days remaining in the period (incl. that day). A day
 * is a "win" if its expenses are ≤ its budget (or it's a no-spend day).
 * Over-budget days break the streak unless the user has manually restored them
 * (a per-period allowance of "saves"). The streak continues across periods.
 *
 * In days mode a day can fall outside every period — between two of them, or
 * before the user started their first. Those days have no budget, so they are
 * marked "untracked" and skipped by the streak entirely: they neither extend it
 * nor break it. Month mode never produces them, since the calendar always
 * covers every day.
 *
 * `config` is { mode, savingsByMonth, periods } — the same inputs the resolver
 * takes, so this stays a pure function the tests can drive without a database.
 */
export function computeStreak(transactions, restoredDays, todayStr, config = {}) {
  const resolve = createPeriodResolver(config);
  const restored = new Set((restoredDays || []).filter((date) => parseYmd(date)));
  // Callers validate that the client's date is close to the server's before
  // getting here, so this only has to parse it — leaving the proximity check to
  // the handlers keeps this function pure and testable at any date.
  const today = parseYmd(todayStr) || startOfUtcToday();
  const todayKey = ymd(today);

  const activePeriod = resolve(todayKey);
  const savesUsedIn = (period) =>
    period
      ? [...restored].filter((d) => resolve(d)?.key === period.key).length
      : 0;
  const savesLeftIn = (period) =>
    period ? Math.max(0, savesForPeriod(period.days) - savesUsedIn(period)) : 0;

  const periodInfo = (period) =>
    period
      ? {
          start: period.start,
          end: period.end,
          days: period.days,
          daysLeft: daysLeftInPeriod(todayKey, period),
          savings: period.savings,
          savesTotal: savesForPeriod(period.days),
        }
      : null;

  const empty = {
    hasData: false,
    hasIncome: false,
    overspentBy: 0,
    leftToSpend: activePeriod ? roundMoney(-activePeriod.savings) : 0,
    periodSavings: activePeriod?.savings ?? 0,
    period: periodInfo(activePeriod),
    periodStatus: activePeriod ? "active" : "inactive",
    currentStreak: 0,
    longestStreak: 0,
    today: { spent: 0, budget: 0, remaining: 0, within: true },
    savesLeftThisPeriod: savesLeftIn(activePeriod),
    restore: null,
    last7: [],
    periodDays: [],
  };

  if (!transactions.length) return empty;

  // Aggregate: expenses per day, income per period. Income logged on an
  // untracked day belongs to no period, so it funds no daily budget — it still
  // counts towards lifetime totals elsewhere.
  const expenseByDay = new Map();
  const incomeByPeriod = new Map();
  for (const t of transactions) {
    const key = ymd(new Date(t.date));
    if (t.type === "expense") {
      expenseByDay.set(key, (expenseByDay.get(key) || 0) + t.amount);
    } else {
      const period = resolve(key);
      if (period) {
        incomeByPeriod.set(period.key, (incomeByPeriod.get(period.key) || 0) + t.amount);
      }
    }
  }

  // Walk from the first transaction: days before it have no history to judge,
  // and counting them as no-spend wins would hand out a streak for time the
  // user wasn't using the app. Bound the work to ten years even if legacy data
  // contains very old dates.
  const rawFirstDay = dayFromYmd(ymd(new Date(transactions[0].date)));
  const historyFloor = addDays(today, -(MAX_STREAK_DAYS - 1));
  let firstDay = rawFirstDay;
  if (firstDay > today) firstDay = today;
  if (firstDay < historyFloor) firstDay = historyFloor;

  const days = []; // { ymd, spent, budget, status, periodKey }
  let cursor = firstDay;
  let curPeriodKey = null;
  let cumExpense = 0;
  while (ymd(cursor) <= todayKey) {
    const key = ymd(cursor);
    const period = resolve(key);
    const periodKey = period?.key ?? null;
    // Each period spends its own income: reset the running total on every
    // boundary, including moving into or out of an untracked stretch.
    if (periodKey !== curPeriodKey) {
      curPeriodKey = periodKey;
      cumExpense = 0;
    }

    const spent = expenseByDay.get(key) || 0;
    let status;
    let budget = 0;

    if (!period) {
      status = "untracked";
    } else {
      const periodIncome = incomeByPeriod.get(period.key) || 0;
      const daysLeft = daysLeftInPeriod(key, period);
      // Reserve the period's savings target before spreading what's left.
      budget =
        daysLeft > 0 ? (periodIncome - period.savings - cumExpense) / daysLeft : 0;

      if (spent === 0 || spent <= budget + 1e-9) status = "win";
      else if (restored.has(key)) status = "saved";
      else status = "break";
    }

    days.push({ ymd: key, spent, budget, status, periodKey });
    cumExpense += spent;
    cursor = addDays(cursor, 1);
  }

  const todayEntry = days[days.length - 1];
  const todayTracked = todayEntry.status !== "untracked";
  const todayWithin =
    !todayTracked ||
    todayEntry.spent === 0 ||
    todayEntry.spent <= todayEntry.budget + 1e-9;

  // Current streak: count back from today through win/saved days, stopping at
  // the first unrestored break. Untracked days are skipped — they carry no
  // budget, so there is nothing to pass or fail.
  let currentStreak = 0;
  let breakingDate = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.status === "untracked") continue;
    if (i === days.length - 1) {
      // Today counts only once it's on track, but going over doesn't break the
      // streak until the day is done.
      if (todayWithin && todayTracked) currentStreak += 1;
      continue;
    }
    if (day.status === "win" || day.status === "saved") currentStreak += 1;
    else {
      breakingDate = day.ymd;
      break;
    }
  }

  // Longest streak across all days (today counts if on track).
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (day.status === "untracked") continue;
    const isToday = i === days.length - 1;
    const isWin = isToday
      ? todayWithin && todayTracked
      : day.status === "win" || day.status === "saved";
    if (isWin) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  // Restore offer: the day currently breaking the streak, if its period has
  // saves left.
  let restore = null;
  if (breakingDate) {
    const breakPeriod = resolve(breakingDate);
    const left = savesLeftIn(breakPeriod);
    if (left > 0) restore = { date: breakingDate, savesLeft: left };
  }

  // Last 7 days (oldest→newest), padding history shorter than a week.
  const last7 = [];
  for (let n = 6; n >= 0; n--) {
    const key = ymd(addDays(today, -n));
    const entry = days.find((x) => x.ymd === key);
    if (!entry) {
      last7.push({ date: key, spent: 0, budget: 0, status: "none" });
    } else if (key === todayKey) {
      last7.push({
        date: key,
        spent: entry.spent,
        budget: entry.budget,
        status: todayTracked ? "today" : "untracked",
        within: todayWithin,
      });
    } else {
      // Normalise the field name to `date` so the client has a consistent key.
      last7.push({
        date: entry.ymd,
        spent: entry.spent,
        budget: entry.budget,
        status: entry.status,
      });
    }
  }

  // The active period's day-by-day picture (drives the tracker's daily views,
  // so the tracker judges each day exactly like the streak does).
  const periodDays = activePeriod
    ? days
        .filter((d) => d.periodKey === activePeriod.key)
        .map((d) => ({ date: d.ymd, spent: d.spent, budget: d.budget, status: d.status }))
    : [];

  // How far the period as a whole has gone past what it had to spend. Once
  // this is above zero the daily budget is negative and stays that way until
  // the period ends or more income lands — on a long period that can be
  // months, so the client warns instead of showing a meaningless $0/day.
  const periodSpent = activePeriod
    ? days.reduce((sum, d) => (d.periodKey === activePeriod.key ? sum + d.spent : sum), 0)
    : 0;
  const spendable = activePeriod
    ? (incomeByPeriod.get(activePeriod.key) || 0) - activePeriod.savings
    : 0;
  const overspentBy = activePeriod
    ? Math.max(0, Math.round((periodSpent - spendable) * 100) / 100)
    : 0;
  // The same figure home stats call `leftToSpend`: what the period has left
  // after its savings target, today's spending included. The client divides it
  // by the days after today to get a daily budget that moves as you spend,
  // rather than the fixed one today was handed this morning.
  const leftToSpend = activePeriod ? roundMoney(spendable - periodSpent) : 0;

  return {
    hasData: true,
    hasIncome: activePeriod
      ? (incomeByPeriod.get(activePeriod.key) || 0) > 0
      : false,
    overspentBy,
    leftToSpend,
    periodSavings: activePeriod?.savings ?? 0,
    period: periodInfo(activePeriod),
    periodStatus: activePeriod ? "active" : "inactive",
    currentStreak,
    longestStreak,
    today: {
      spent: todayEntry.spent,
      budget: todayTracked ? Math.max(0, todayEntry.budget) : 0,
      remaining: todayTracked ? todayEntry.budget - todayEntry.spent : 0,
      within: todayWithin,
    },
    savesLeftThisPeriod: savesLeftIn(activePeriod),
    restore,
    last7,
    periodDays,
  };
}

function startOfUtcToday() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** GET /api/streak?today=YYYY-MM-DD */
export async function getStreak(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });

  const todayKey = ymd(today);
  // Before the context is built, not alongside it — the loader reads the very
  // map this may write to. Recurring entries likewise have to be written before
  // the transactions are read, or a rent due today wouldn't reach the streak
  // until the next request.
  await ensureCurrentMonthSavings(req.user, todayKey);
  await ensureRecurringDue(req.user, todayKey);
  const [transactions, context] = await Promise.all([
    Transaction.find({ userId: req.user._id }).sort({ date: 1 }),
    loadPeriodContext(req.user, todayKey),
  ]);

  res.json(
    computeStreak(transactions, req.user.restoredDays, todayKey, {
      mode: context.mode,
      savingsByMonth: context.savingsByMonth,
      periods: context.periods,
    })
  );
}

/** POST /api/streak/restore { date } -> spend a save to repair the breaking day. */
export async function restoreStreak(req, res) {
  const { date, today: requestedToday } = req.body;
  const restoreDate = parseYmd(date);
  const today = resolveClientToday(requestedToday);
  if (!restoreDate || !today || restoreDate > today) {
    return res.status(400).json({ message: "Invalid date" });
  }

  const todayKey = ymd(today);
  await ensureCurrentMonthSavings(req.user, todayKey);
  await ensureRecurringDue(req.user, todayKey);
  const [transactions, context] = await Promise.all([
    Transaction.find({ userId: req.user._id }).sort({ date: 1 }),
    loadPeriodContext(req.user, todayKey),
  ]);
  const config = {
    mode: context.mode,
    savingsByMonth: context.savingsByMonth,
    periods: context.periods,
  };
  const result = computeStreak(transactions, req.user.restoredDays, todayKey, config);

  // Only the day currently breaking the streak may be restored.
  if (!result.restore || result.restore.date !== date) {
    return res
      .status(400)
      .json({ message: "That day can't be restored right now." });
  }

  if (!req.user.restoredDays.includes(date)) {
    req.user.restoredDays.push(date);
    await req.user.save();
  }

  res.json(computeStreak(transactions, req.user.restoredDays, todayKey, config));
}

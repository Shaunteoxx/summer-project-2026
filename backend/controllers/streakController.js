import Transaction from "../models/Transaction.js";

const SAVES_PER_MONTH = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// --- Date helpers (everything in UTC, dates are stored at UTC midnight) ---
const ymd = (date) => date.toISOString().slice(0, 10);
const dayFromYmd = (s) => new Date(`${s}T00:00:00.000Z`);
const addDays = (date, n) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n));
const monthKeyOf = (date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
const monthKeyOfYmd = (s) => {
  const d = dayFromYmd(s);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
};
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * Compute the daily-budget streak from a user's transaction history.
 *
 * Daily budget for a day = (that month's income − expenses earlier that month)
 * ÷ days remaining in the month (incl. that day). A day is a "win" if its
 * expenses are ≤ its budget (or it's a no-spend day). Over-budget days break
 * the streak unless the user has manually restored them (a monthly-limited
 * "save"). The streak continues across months.
 */
export function computeStreak(transactions, restoredDays, todayStr, savingsByMonth = {}) {
  const savingsFor = (mk) => Math.max(0, Number(savingsByMonth?.[mk]) || 0);
  const restored = new Set(restoredDays || []);
  const today = DATE_RE.test(todayStr || "") ? dayFromYmd(todayStr) : startOfUtcToday();
  const todayKey = ymd(today);

  const savesUsedInMonth = (monthKey) =>
    [...restored].filter((d) => monthKeyOfYmd(d) === monthKey).length;
  const savesLeftInMonth = (monthKey) =>
    Math.max(0, SAVES_PER_MONTH - savesUsedInMonth(monthKey));

  const currentMonthKey = monthKeyOf(today);
  const empty = {
    hasData: false,
    hasIncome: false,
    monthlySavings: savingsFor(currentMonthKey),
    currentStreak: 0,
    longestStreak: 0,
    today: { spent: 0, budget: 0, remaining: 0, within: true },
    savesLeftThisMonth: savesLeftInMonth(currentMonthKey),
    restore: null,
    last7: [],
  };

  if (!transactions.length) return empty;

  // Aggregate: expenses per day, income per month.
  const expenseByDay = new Map();
  const incomeByMonth = new Map();
  for (const t of transactions) {
    const d = new Date(t.date);
    if (t.type === "expense") {
      const k = ymd(d);
      expenseByDay.set(k, (expenseByDay.get(k) || 0) + t.amount);
    } else {
      const mk = monthKeyOf(d);
      incomeByMonth.set(mk, (incomeByMonth.get(mk) || 0) + t.amount);
    }
  }

  // Walk every calendar day from the first transaction to today.
  const firstDay = dayFromYmd(ymd(new Date(transactions[0].date)));
  const days = []; // { ymd, spent, budget, status }
  let cursor = firstDay;
  let curMonthKey = null;
  let cumExpense = 0;
  while (ymd(cursor) <= todayKey) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const mk = `${year}-${month}`;
    if (mk !== curMonthKey) {
      curMonthKey = mk;
      cumExpense = 0;
    }
    const key = ymd(cursor);
    const spent = expenseByDay.get(key) || 0;
    const monthIncome = incomeByMonth.get(mk) || 0;
    const daysLeft = daysInMonth(year, month) - cursor.getUTCDate() + 1;
    // Reserve that month's savings target before spreading over the days left.
    const budget =
      daysLeft > 0 ? (monthIncome - savingsFor(mk) - cumExpense) / daysLeft : 0;

    let status;
    if (spent === 0 || spent <= budget + 1e-9) status = "win";
    else if (restored.has(key)) status = "saved";
    else status = "break";

    days.push({ ymd: key, spent, budget, status });
    cumExpense += spent;
    cursor = addDays(cursor, 1);
  }

  const todayEntry = days[days.length - 1];
  const todayWithin =
    todayEntry.spent === 0 || todayEntry.spent <= todayEntry.budget + 1e-9;

  // Current streak: count back from today (today counts only if on track),
  // through win/saved days, stopping at the first unrestored break.
  let currentStreak = 0;
  let breakingDate = null;
  if (todayWithin) currentStreak += 1;
  for (let i = days.length - 2; i >= 0; i--) {
    const s = days[i].status;
    if (s === "win" || s === "saved") currentStreak += 1;
    else {
      breakingDate = days[i].ymd;
      break;
    }
  }

  // Longest streak across all days (today counts if on track).
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    const isToday = i === days.length - 1;
    const isWin = isToday
      ? todayWithin
      : days[i].status === "win" || days[i].status === "saved";
    if (isWin) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  // Restore offer: the day currently breaking the streak, if its month has saves.
  let restore = null;
  if (breakingDate) {
    const bMonth = monthKeyOfYmd(breakingDate);
    const left = savesLeftInMonth(bMonth);
    if (left > 0) restore = { date: breakingDate, savesLeft: left };
  }

  // Last 7 days (oldest→newest), padding history shorter than a week.
  const last7 = [];
  for (let n = 6; n >= 0; n--) {
    const d = addDays(today, -n);
    const key = ymd(d);
    const entry = days.find((x) => x.ymd === key);
    if (!entry) {
      last7.push({ date: key, spent: 0, budget: 0, status: "none" });
    } else if (key === todayKey) {
      last7.push({
        date: key,
        spent: entry.spent,
        budget: entry.budget,
        status: "today",
        within: todayWithin,
      });
    } else {
      last7.push(entry);
    }
  }

  return {
    hasData: true,
    hasIncome: (incomeByMonth.get(currentMonthKey) || 0) > 0,
    monthlySavings: savingsFor(currentMonthKey),
    currentStreak,
    longestStreak,
    today: {
      spent: todayEntry.spent,
      budget: Math.max(0, todayEntry.budget),
      remaining: todayEntry.budget - todayEntry.spent,
      within: todayWithin,
    },
    savesLeftThisMonth: savesLeftInMonth(currentMonthKey),
    restore,
    last7,
  };
}

function startOfUtcToday() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** GET /api/streak?today=YYYY-MM-DD */
export async function getStreak(req, res) {
  const transactions = await Transaction.find({ userId: req.user._id }).sort({
    date: 1,
  });
  const result = computeStreak(
    transactions,
    req.user.restoredDays,
    req.query.today,
    Object.fromEntries(req.user.savingsByMonth || [])
  );
  res.json(result);
}

/** POST /api/streak/restore { date } -> spend a save to repair the breaking day. */
export async function restoreStreak(req, res) {
  const { date, today } = req.body;
  if (!DATE_RE.test(date || "")) {
    return res.status(400).json({ message: "Invalid date" });
  }

  const transactions = await Transaction.find({ userId: req.user._id }).sort({
    date: 1,
  });
  const result = computeStreak(
    transactions,
    req.user.restoredDays,
    today,
    Object.fromEntries(req.user.savingsByMonth || [])
  );

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

  const updated = computeStreak(
    transactions,
    req.user.restoredDays,
    today,
    Object.fromEntries(req.user.savingsByMonth || [])
  );
  res.json(updated);
}

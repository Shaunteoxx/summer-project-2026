import BudgetPeriod from "../models/BudgetPeriod.js";
import {
  MAX_PERIOD_DAYS,
  MIN_PERIOD_DAYS,
  daysLeftInPeriod,
  periodEnd,
  savesForPeriod,
  toPeriod,
} from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";
import {
  MAX_YEAR,
  MIN_YEAR,
  parseYmd,
  resolveClientToday,
  roundMoney,
  utcToday,
  ymd,
} from "../lib/validation.js";

/** Shape a period for the client, with the extras only "today" can supply. */
function present(period, todayKey) {
  if (!period) return null;
  return {
    id: period.id,
    start: period.start,
    end: period.end,
    days: period.days,
    savings: period.savings,
    savesTotal: savesForPeriod(period.days),
    daysLeft: daysLeftInPeriod(todayKey, period),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function validateStart(value) {
  const date = parseYmd(value);
  if (!date) return { error: "Enter a valid start date" };
  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return { error: "Start date is out of range" };
  }
  // Periods are started by hand when they begin, so a future start would leave
  // today in no period at all. A day of slack lets clients ahead of UTC start
  // "today" on their own clock.
  if (date.getTime() - utcToday().getTime() > DAY_MS) {
    return { error: "Start date can't be in the future" };
  }
  return { start: ymd(date) };
}

function validateLength(value) {
  const length = Number(value);
  if (!Number.isInteger(length) || length < MIN_PERIOD_DAYS || length > MAX_PERIOD_DAYS) {
    return { error: `Length must be between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS} days` };
  }
  return { length };
}

function validateSavings(value) {
  if (value === undefined || value === null || value === "") return { savingsTarget: 0 };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) {
    return { error: "Invalid savings amount" };
  }
  return { savingsTarget: roundMoney(amount) };
}

/** Two inclusive ranges overlap unless one ends before the other begins. */
const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;

async function findOverlap(userId, range, excludeId) {
  const existing = await BudgetPeriod.find({
    userId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    // Cheap pre-filter; the exact check happens below on the returned rows.
    start: { $lte: range.end },
  })
    .sort({ start: 1 })
    .lean();
  return existing.map(toPeriod).find((p) => overlaps(p, range)) ?? null;
}

/** GET /api/period?today=YYYY-MM-DD -> mode, the active period, and history. */
export async function getPeriod(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const todayKey = ymd(today);

  await ensureCurrentMonthSavings(req.user, todayKey);
  const context = await loadPeriodContext(req.user, todayKey);
  res.json({
    mode: context.mode,
    status: context.status,
    current: present(context.active, todayKey),
    previous: present(context.previous, todayKey),
    // Newest first; month mode has no stored history to list.
    history: context.periods
      .map(toPeriod)
      .sort((a, b) => (a.start < b.start ? 1 : -1))
      .map((p) => present(p, todayKey)),
  });
}

/** PUT /api/period/mode { mode } -> switch between calendar months and days. */
export async function setPeriodMode(req, res) {
  const { mode } = req.body;
  if (!["month", "days"].includes(mode)) {
    return res.status(400).json({ message: "Invalid budget mode" });
  }
  // Switching is non-destructive: savingsByMonth and the stored periods both
  // survive, so flipping back restores exactly what was there before.
  req.user.budgetMode = mode;
  await req.user.save();
  res.json({ mode });
}

/** POST /api/period { start, length, savingsTarget } -> start a new period. */
export async function createPeriod(req, res) {
  const startCheck = validateStart(req.body.start);
  if (startCheck.error) return res.status(400).json({ message: startCheck.error });
  const lengthCheck = validateLength(req.body.length);
  if (lengthCheck.error) return res.status(400).json({ message: lengthCheck.error });
  const savingsCheck = validateSavings(req.body.savingsTarget);
  if (savingsCheck.error) return res.status(400).json({ message: savingsCheck.error });

  const start = startCheck.start;
  const end = periodEnd(start, lengthCheck.length);

  const clash = await findOverlap(req.user._id, { start, end });
  if (clash) {
    return res.status(409).json({
      message: `That overlaps your ${clash.start} – ${clash.end} period`,
    });
  }

  const created = await BudgetPeriod.create({
    userId: req.user._id,
    start,
    end,
    length: lengthCheck.length,
    savingsTarget: savingsCheck.savingsTarget,
  });

  // Starting a period is how days mode gets switched on for a first-timer.
  if (req.user.budgetMode !== "days") {
    req.user.budgetMode = "days";
    await req.user.save();
  }

  res.status(201).json(present(toPeriod(created), ymd(new Date())));
}

/**
 * PATCH /api/period/:id { start, length, savingsTarget } -> adjust a period.
 * `start` is editable so a mistyped date can be corrected without losing the
 * period (and the savings target attached to it).
 */
export async function updatePeriod(req, res) {
  const period = await BudgetPeriod.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!period) return res.status(404).json({ message: "Period not found" });

  if (req.body.start !== undefined) {
    const startCheck = validateStart(req.body.start);
    if (startCheck.error) return res.status(400).json({ message: startCheck.error });
    period.start = startCheck.start;
  }

  if (req.body.length !== undefined) {
    const lengthCheck = validateLength(req.body.length);
    if (lengthCheck.error) return res.status(400).json({ message: lengthCheck.error });
    period.length = lengthCheck.length;
  }

  if (req.body.savingsTarget !== undefined) {
    const savingsCheck = validateSavings(req.body.savingsTarget);
    if (savingsCheck.error) return res.status(400).json({ message: savingsCheck.error });
    period.savingsTarget = savingsCheck.savingsTarget;
  }

  // The end date is always derived, so recompute it after either edit.
  period.end = periodEnd(period.start, period.length);

  // Moving or growing a period can push it into a neighbour.
  const clash = await findOverlap(
    req.user._id,
    { start: period.start, end: period.end },
    period._id
  );
  if (clash) {
    return res.status(409).json({
      message: `That would overlap your ${clash.start} – ${clash.end} period`,
    });
  }

  await period.save();
  res.json(present(toPeriod(period), ymd(new Date())));
}

/**
 * DELETE /api/period/:id -> remove a period.
 *
 * Transactions are deliberately left alone: only the budget window goes away,
 * so the period's days become untracked (no daily budget, and skipped by the
 * streak) while the money stays in the ledger and in the month-based history
 * on /stats.
 */
export async function deletePeriod(req, res) {
  const deleted = await BudgetPeriod.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!deleted) return res.status(404).json({ message: "Period not found" });
  res.json({ message: "Deleted", id: req.params.id });
}

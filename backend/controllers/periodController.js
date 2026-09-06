import BudgetPeriod from "../models/BudgetPeriod.js";
import BudgetTerm from "../models/BudgetTerm.js";
import {
  MAX_PERIOD_DAYS,
  MAX_TERM_MONTHS,
  MIN_PERIOD_DAYS,
  MIN_TERM_MONTHS,
  termEnd,
  daysLeftInPeriod,
  normalisePeriods,
  periodEnd,
  savesForPeriod,
  toPeriod,
} from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";
import { ensureRecurringDue } from "../lib/recurring.js";
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
    // Term mode only: which cycle of the term this is, and its slice of the
    // pot. Null everywhere else.
    funding: period.funding ?? null,
    cycle: period.index === undefined ? null : period.index + 1,
    cycles: period.cycles ?? null,
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
  await ensureRecurringDue(req.user, todayKey);
  const context = await loadPeriodContext(req.user, todayKey);
  res.json({
    mode: context.mode,
    status: context.status,
    current: present(context.active, todayKey),
    previous: present(context.previous, todayKey),
    // Newest first; month mode has no stored history to list. Term cycles
    // arrive already resolved, which is what normalisePeriods is guarding —
    // toPeriod would read `length` off them and hand back undefined.
    history: normalisePeriods(context.periods)
      .sort((a, b) => (a.start < b.start ? 1 : -1))
      .map((p) => ({
        ...present(p, todayKey),
        // What this cycle was actually given. Null on one still to come: its
        // share depends on spending that hasn't happened.
        funding: context.cycleFunding?.get(p.key) ?? null,
      })),
    // The window behind the cycles, so the settings sheet can render the form
    // without a second request. Null unless the user is in term mode.
    term: presentTerm(
      (context.terms ?? []).find((t) => String(t._id) === context.active?.termId) ??
        (context.terms ?? []).at(-1),
      context.termTotals
    ),
    terms: (context.terms ?? []).map(presentTerm),
  });
}

/** PUT /api/period/mode { mode } -> switch between calendar months and days. */
export async function setPeriodMode(req, res) {
  const { mode } = req.body;
  if (!["month", "days", "term"].includes(mode)) {
    return res.status(400).json({ message: "Invalid budget mode" });
  }
  // Switching is non-destructive: savingsByMonth, the stored periods and the
  // stored terms all survive, so flipping back restores what was there before.
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

/* ---------------------------------------------------------------------------
 * Terms — one lump sum, budgeted a month at a time.
 *
 * A term stores only a window. There is no amount and no savings target on it:
 * the money is the income the user logs as normal, and the target keeps living
 * in savingsByMonth because the cycles are calendar months. See models/
 * BudgetTerm.js for why both of those are deliberate.
 * ------------------------------------------------------------------------- */

/** Shape a term for the client, with its running totals when they're known. */
function presentTerm(term, totals) {
  if (!term) return null;
  return {
    id: String(term._id ?? term.id ?? ""),
    start: term.start,
    end: term.end,
    months: term.months,
    // Only costed for the term the user is actually in, so a listed past term
    // carries nulls rather than a figure nobody asked the database for.
    income: totals?.income ?? null,
    spent: totals?.spent ?? null,
    left: totals?.left ?? null,
  };
}

function validateMonths(value) {
  const months = Number(value);
  if (!Number.isInteger(months) || months < MIN_TERM_MONTHS || months > MAX_TERM_MONTHS) {
    return {
      error: `Length must be between ${MIN_TERM_MONTHS} and ${MAX_TERM_MONTHS} months`,
    };
  }
  return { months };
}

/**
 * Terms may not overlap each other, for the same reason periods may not: a day
 * has to belong to exactly one window or the resolver has to pick, and whichever
 * it picked would be a guess. Terms *may* overlap BudgetPeriod rows — only one
 * mode is live at a time, and checking across collections would make switching
 * modes a minefield.
 */
async function findTermOverlap(userId, range, excludeId) {
  const existing = await BudgetTerm.find({
    userId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    // Cheap pre-filter; the exact check happens below on the returned rows.
    start: { $lte: range.end },
  })
    .sort({ start: 1 })
    .lean();
  return existing.find((t) => overlaps(t, range)) ?? null;
}

/** POST /api/period/term { start, months } -> set up a term. */
export async function createTerm(req, res) {
  const startCheck = validateStart(req.body.start);
  if (startCheck.error) return res.status(400).json({ message: startCheck.error });
  const monthsCheck = validateMonths(req.body.months);
  if (monthsCheck.error) return res.status(400).json({ message: monthsCheck.error });

  const start = startCheck.start;
  const end = termEnd(start, monthsCheck.months);

  const clash = await findTermOverlap(req.user._id, { start, end });
  if (clash) {
    return res.status(409).json({
      message: `That overlaps your ${clash.start} – ${clash.end} allowance`,
    });
  }

  const created = await BudgetTerm.create({
    userId: req.user._id,
    start,
    end,
    months: monthsCheck.months,
  });

  // Setting one up is how term mode gets switched on for a first-timer.
  if (req.user.budgetMode !== "term") {
    req.user.budgetMode = "term";
    await req.user.save();
  }

  res.status(201).json(presentTerm(created));
}

/**
 * PATCH /api/period/term/:id { start, months } -> adjust a term.
 * `start` is editable so a mistyped date can be corrected without losing the
 * term and re-grading every cycle under it.
 */
export async function updateTerm(req, res) {
  const term = await BudgetTerm.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!term) return res.status(404).json({ message: "Allowance not found" });

  if (req.body.start !== undefined) {
    const startCheck = validateStart(req.body.start);
    if (startCheck.error) return res.status(400).json({ message: startCheck.error });
    term.start = startCheck.start;
  }

  if (req.body.months !== undefined) {
    const monthsCheck = validateMonths(req.body.months);
    if (monthsCheck.error) return res.status(400).json({ message: monthsCheck.error });
    term.months = monthsCheck.months;
  }

  // The end date is always derived, so recompute it after either edit.
  term.end = termEnd(term.start, term.months);

  const clash = await findTermOverlap(
    req.user._id,
    { start: term.start, end: term.end },
    term._id
  );
  if (clash) {
    return res.status(409).json({
      message: `That would overlap your ${clash.start} – ${clash.end} allowance`,
    });
  }

  await term.save();
  res.json(presentTerm(term));
}

/**
 * DELETE /api/period/term/:id -> remove a term.
 *
 * Transactions are deliberately left alone: only the budget window goes away,
 * so the term's days become untracked (no daily budget, and skipped by the
 * streak) while the money stays in the ledger and in the month-based history
 * on /stats.
 */
export async function deleteTerm(req, res) {
  const deleted = await BudgetTerm.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!deleted) return res.status(404).json({ message: "Allowance not found" });
  res.json({ message: "Deleted", id: req.params.id });
}

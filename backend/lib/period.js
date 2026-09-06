/**
 * Budget periods — the window a daily budget is spread across.
 *
 * Three deliberately different modes:
 *   month : the period is derived from the calendar, exactly as the app has
 *           always worked. Nothing is stored, and the savings target comes
 *           from the user's savingsByMonth map.
 *   days  : the user starts a fixed-length period by hand, and starts the next
 *           one once it lapses. Periods are BudgetPeriod rows, and a day that
 *           falls between two of them belongs to no period at all.
 *   term  : one lump sum has to last a long stretch, but the budget still
 *           resets monthly. A BudgetTerm row is only a *window*; the money in
 *           it is the income the user logs as normal. The window is sliced into
 *           calendar-month cycles, and each cycle draws its share of whatever
 *           the term has left — so overspending one month makes the rest
 *           smaller rather than running the term dry early.
 *
 * Everything is keyed by UTC YYYY-MM-DD strings, so ordering is plain string
 * comparison and there is no timezone drift — transaction dates are stored at
 * UTC midnight, and the streak already keys days the same way.
 */
import { roundMoney } from "./validation.js";

export const MIN_PERIOD_DAYS = 1;
export const MAX_PERIOD_DAYS = 366;
// A term is a funding window, not a budgeting one, so MAX_PERIOD_DAYS doesn't
// bound it. Twelve monthly cycles covers the longest allowance anyone gets in
// one go; beyond that the honest answer is a second term.
export const MIN_TERM_MONTHS = 1;
export const MAX_TERM_MONTHS = 12;

// Restores are 3 per 30 days in the month model; scale so a period of any
// length is about as forgiving, but never leave a short period with none.
const BASE_SAVES = 3;
const BASE_SAVE_DAYS = 30;

const pad = (n) => String(n).padStart(2, "0");

export const dayFromYmd = (value) => new Date(`${value}T00:00:00.000Z`);

export const ymdOf = (date) => date.toISOString().slice(0, 10);

export const addDays = (date, n) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n));

export const addDaysYmd = (value, n) => ymdOf(addDays(dayFromYmd(value), n));

/** Whole days from `a` to `b`, inclusive of both ends (same day -> 1). */
export const daysBetween = (a, b) =>
  Math.round((dayFromYmd(b) - dayFromYmd(a)) / 86400000) + 1;

/** Last day of a period that starts at `start` and runs for `length` days. */
export const periodEnd = (start, length) => addDaysYmd(start, length - 1);

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * The same day of month `n` months on, clamped to the target month's length so
 * the 31st lands on the 28th in February rather than overflowing into March.
 * Same rule lib/recurring.js uses for a monthly rule dated after the 28th —
 * one month-arithmetic convention in the codebase, not two.
 */
export function addMonthsYmd(value, n) {
  const date = dayFromYmd(value);
  const anchor = date.getUTCDate();
  const months = date.getUTCFullYear() * 12 + date.getUTCMonth() + n;
  const year = Math.floor(months / 12);
  const month = months - year * 12;
  return `${year}-${pad(month + 1)}-${pad(Math.min(anchor, daysInMonth(year, month)))}`;
}

/** Last day of a term that starts at `start` and runs `months` whole months. */
export const termEnd = (start, months) => addDaysYmd(addMonthsYmd(start, months), -1);

export function savesForPeriod(days) {
  return Math.max(1, Math.round((BASE_SAVES * days) / BASE_SAVE_DAYS));
}

/** Days remaining in `period` counting `today` itself; 0 once it has ended. */
export function daysLeftInPeriod(today, period) {
  if (!period || today > period.end) return 0;
  const from = today < period.start ? period.start : today;
  return daysBetween(from, period.end);
}

/**
 * The calendar month containing `value`, shaped like a stored period so both
 * modes are interchangeable downstream. `monthKey` is the legacy "YYYY-M"
 * savingsByMonth key (0-based month), kept so month mode reads and writes the
 * exact same savings data it always has.
 */
export function monthPeriodOf(value, savingsByMonth = {}) {
  const date = dayFromYmd(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const start = `${year}-${pad(month + 1)}-01`;
  const monthKey = `${year}-${month}`;
  return {
    key: start,
    start,
    end: `${year}-${pad(month + 1)}-${pad(days)}`,
    days,
    savings: Math.max(0, Number(savingsByMonth?.[monthKey]) || 0),
    monthKey,
    // Only term cycles are funded from a pot; everywhere else the budget's
    // numerator is the income logged inside the window, and a null here is what
    // tells the three budget formulas to keep using it.
    funding: null,
  };
}

/** Normalise a BudgetPeriod document into the same shape as a month period. */
export function toPeriod(doc) {
  return {
    id: String(doc._id ?? doc.id ?? ""),
    key: doc.start,
    start: doc.start,
    end: doc.end,
    days: doc.length,
    savings: Math.max(0, Number(doc.savingsTarget) || 0),
    funding: null,
  };
}

/**
 * Slice a term into the calendar months it covers. The first and last cycles
 * are clipped to the term's own bounds, so a term starting on the 15th opens
 * with a stub cycle rather than reaching back over days it doesn't fund.
 *
 * `weight` is a cycle's share of a whole month — 1 for a full one, 17/31 for a
 * 17-day stub. `remainingWeight` is that cycle's weight plus every later one's,
 * which is what funding is measured against; see fundingFor().
 */
export function cyclesOfTerm(term, savingsByMonth = {}) {
  if (!term?.start || !term?.end || term.end < term.start) return [];
  const termId = String(term._id ?? term.id ?? "");
  const cycles = [];

  let cursor = term.start;
  while (cursor <= term.end) {
    const month = monthPeriodOf(cursor, savingsByMonth);
    const start = month.start < term.start ? term.start : month.start;
    const end = month.end > term.end ? term.end : month.end;
    const days = daysBetween(start, end);
    cycles.push({
      id: `${termId}:${cycles.length}`,
      key: start,
      termId,
      index: cycles.length,
      start,
      end,
      days,
      // Cycles are calendar months, so the target keeps living in the user's
      // savingsByMonth map and month mode's carry keeps working untouched.
      savings: month.savings,
      monthKey: month.monthKey,
      weight: days / month.days,
      funding: null,
    });
    cursor = addDaysYmd(end, 1);
  }

  let tail = 0;
  for (let i = cycles.length - 1; i >= 0; i -= 1) {
    tail += cycles[i].weight;
    cycles[i].remainingWeight = tail;
    cycles[i].cycles = cycles.length;
  }
  return cycles;
}

/**
 * What a cycle gets to spend: its share of whatever the term has left.
 *
 * `pot` is the term's income up to the end of this cycle minus everything spent
 * before it began, so the split rebalances on its own — overspend one month and
 * the pot is smaller when the next one asks, underspend and it's larger. Whole
 * months weigh the same as each other, so the answer reads "$1,000 a month"
 * rather than drifting with month length; only a clipped stub takes less.
 */
export function fundingFor(cycle, pot = 0) {
  if (!cycle?.remainingWeight) return 0;
  return roundMoney((Math.max(0, pot) * cycle.weight) / cycle.remainingWeight);
}

/**
 * Walk a term's cycles in order, pricing each one: `key -> funding`.
 *
 * Order is what makes it cheap: income counts up to the end of the cycle being
 * priced and spending only up to the end of the one before, so both running
 * totals move forwards and nothing has to be re-summed.
 *
 * Every cycle gets a figure, but only those at or before today's are *settled*.
 * A later one is priced as though the current cycle stopped spending now, which
 * it won't — the caller decides which entries it can honestly show.
 */
export function priceCycles(cycles = [], { incomeByCycle, expenseByCycle } = {}) {
  const funding = new Map();
  let incomeThrough = 0;
  let spentBefore = 0;
  for (const cycle of cycles) {
    incomeThrough += incomeByCycle?.get(cycle.key) || 0;
    funding.set(cycle.key, fundingFor(cycle, incomeThrough - spentBefore));
    spentBefore += expenseByCycle?.get(cycle.key) || 0;
  }
  return funding;
}

/**
 * Look a day up in a list of non-overlapping windows. Binary-searches a sorted
 * copy, so the streak's day-by-day walk over a long history stays cheap — it
 * resolves every day since the user's first transaction on every request.
 */
function searcher(windows) {
  const sorted = [...windows].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0
  );

  return (value) => {
    let lo = 0;
    let hi = sorted.length - 1;
    let candidate = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].start <= value) {
        candidate = sorted[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return candidate && value <= candidate.end ? candidate : null;
  };
}

/**
 * Build `(ymd) -> period | null` for a user. A null result never happens in
 * month mode, since the calendar covers every day. In days mode it means the
 * day sits in a gap between periods, or before the user started one; in term
 * mode it means the day falls outside every term. Either way it has no budget
 * and cannot be judged.
 *
 * Term cycles are expanded once, here, rather than per lookup.
 */
export function createPeriodResolver({
  mode,
  savingsByMonth = {},
  periods = [],
  terms = [],
} = {}) {
  if (mode === "term") {
    return searcher(terms.flatMap((term) => cyclesOfTerm(term, savingsByMonth)));
  }
  if (mode !== "days") {
    return (value) => monthPeriodOf(value, savingsByMonth);
  }
  return searcher(periods.map(toPeriod));
}

/**
 * Where the user stands on `today`:
 *   active  — a period covers today
 *   lapsed  — periods exist but the latest one has ended (start the next)
 *   none    — days mode with nothing set up yet
 * Month mode is always active, since the calendar never runs out.
 */
export function periodStatus(today, period, periods = []) {
  if (period) return "active";
  return periods.length > 0 ? "lapsed" : "none";
}

/**
 * Windows reach here as raw BudgetPeriod documents in days mode but as already
 * resolved cycles in term mode, and toPeriod would read `length`/`savingsTarget`
 * off a cycle and hand back undefineds. `days` is the tell: only a resolved
 * window has it.
 */
export const normalisePeriods = (windows = []) =>
  windows.map((w) => (w?.days === undefined ? toPeriod(w) : w));

/** The most recent period at or before `today`, used to describe a lapse. */
export function latestPeriodBefore(today, periods = []) {
  return (
    normalisePeriods(periods)
      .filter((p) => p.end < today)
      .sort((a, b) => (a.end < b.end ? 1 : -1))[0] ?? null
  );
}

/**
 * Budget periods — the window a daily budget is spread across.
 *
 * Two deliberately different modes:
 *   month : the period is derived from the calendar, exactly as the app has
 *           always worked. Nothing is stored, and the savings target comes
 *           from the user's savingsByMonth map.
 *   days  : the user starts a fixed-length period by hand, and starts the next
 *           one once it lapses. Periods are BudgetPeriod rows, and a day that
 *           falls between two of them belongs to no period at all.
 *
 * Everything is keyed by UTC YYYY-MM-DD strings, so ordering is plain string
 * comparison and there is no timezone drift — transaction dates are stored at
 * UTC midnight, and the streak already keys days the same way.
 */

export const MIN_PERIOD_DAYS = 1;
export const MAX_PERIOD_DAYS = 366;

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
  };
}

/**
 * Build `(ymd) -> period | null` for a user. A null result only happens in
 * days mode: it means the day sits in a gap between periods, or before the
 * user ever started one, so it has no budget and cannot be judged.
 *
 * The days-mode lookup binary-searches a sorted copy, so the streak's
 * day-by-day walk over a long history stays cheap.
 */
export function createPeriodResolver({ mode, savingsByMonth = {}, periods = [] } = {}) {
  if (mode !== "days") {
    return (value) => monthPeriodOf(value, savingsByMonth);
  }

  const sorted = periods
    .map(toPeriod)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

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

/** The most recent period at or before `today`, used to describe a lapse. */
export function latestPeriodBefore(today, periods = []) {
  return periods
    .map(toPeriod)
    .filter((p) => p.end < today)
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0] ?? null;
}

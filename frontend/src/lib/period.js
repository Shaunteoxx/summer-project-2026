/**
 * Client-side mirror of the server's budget-period helpers.
 *
 * The server is the authority on which period is active — this module only
 * formats and measures the period it hands back, so labels and day grids can
 * be rendered without another round trip.
 *
 * Dates are UTC YYYY-MM-DD strings throughout, matching the API and the day
 * keys the streak uses.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

export const MIN_PERIOD_DAYS = 1;
export const MAX_PERIOD_DAYS = 366;

/**
 * A UTC midnight Date from a day key.
 *
 * Slices to the first 10 characters so a full stored timestamp
 * ("2026-08-11T00:00:00.000Z") works as well as a bare key ("2026-08-11").
 * Without it the template produced "…000ZT00:00:00.000Z", an Invalid Date whose
 * getUTCDate() is NaN and whose month indexes SHORT_MONTHS out of bounds — so
 * the date rendered as the string "NaN undefined" rather than throwing.
 * Transaction dates come off the API in the long form, so this is reachable
 * from any caller that hands one straight through.
 */
export const dayFromYmd = (value) =>
  new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

export const ymdOf = (date) => date.toISOString().slice(0, 10);

export const addDaysYmd = (value, n) => {
  const d = dayFromYmd(value);
  return ymdOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n)));
};

/** Whole days from `a` to `b`, inclusive of both ends (same day -> 1). */
export const daysBetween = (a, b) =>
  Math.round((dayFromYmd(b) - dayFromYmd(a)) / 86400000) + 1;

export const periodEnd = (start, length) => addDaysYmd(start, length - 1);

/** Days remaining in `period` counting today; 0 once it has ended. */
export function daysLeftInPeriod(today, period) {
  if (!period || today > period.end) return 0;
  const from = today < period.start ? period.start : today;
  return daysBetween(from, period.end);
}

/** Every day in a period, oldest first, as YYYY-MM-DD strings. */
export function periodDayList(period) {
  if (!period) return [];
  const days = [];
  for (let cursor = period.start; cursor <= period.end; cursor = addDaysYmd(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

/** "14 Aug" / "14 Aug 2027" — the year only when it isn't the current one. */
export function formatDay(value, { withYear = false } = {}) {
  if (!value) return "";
  const d = dayFromYmd(value);
  const base = `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/**
 * A period's headline label. Month-length periods that line up with a calendar
 * month read as "August 2026"; anything else reads as a range, e.g.
 * "1 – 15 Aug" or "25 Aug – 7 Sep".
 */
export function formatPeriodLabel(period, { mode = "days" } = {}) {
  if (!period) return "";
  const start = dayFromYmd(period.start);
  const end = dayFromYmd(period.end);

  const isWholeMonth =
    mode === "month" ||
    (start.getUTCDate() === 1 &&
      end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate() &&
      start.getUTCMonth() === end.getUTCMonth() &&
      start.getUTCFullYear() === end.getUTCFullYear());
  if (isWholeMonth) {
    return `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }

  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  if (sameMonth) {
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${SHORT_MONTHS[end.getUTCMonth()]}`;
  }
  const crossesYear = start.getUTCFullYear() !== end.getUTCFullYear();
  return `${formatDay(period.start, { withYear: crossesYear })} – ${formatDay(period.end, { withYear: crossesYear })}`;
}

/** "August 2026" for the calendar month a day falls in. */
export function formatMonthLabel(value) {
  if (!value) return "";
  const d = dayFromYmd(value);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

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

export const MIN_TERM_MONTHS = 1;
export const MAX_TERM_MONTHS = 12;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * The same day of month `n` months on, clamped to the target month's length so
 * the 31st lands on the 28th in February rather than overflowing into March.
 * Mirrors backend/lib/period.js; the server stays the authority, this is only
 * so the setup form can preview what it is about to create.
 */
export function addMonthsYmd(value, n) {
  const date = dayFromYmd(value);
  const anchor = date.getUTCDate();
  const months = date.getUTCFullYear() * 12 + date.getUTCMonth() + n;
  const year = Math.floor(months / 12);
  const month = months - year * 12;
  const day = Math.min(anchor, daysInMonth(year, month));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Last day of a term that starts at `start` and runs `months` whole months. */
export const termEnd = (start, months) => addDaysYmd(addMonthsYmd(start, months), -1);

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

/**
 * "14 Aug" / "14 Aug 2027" — the year only when it isn't the current one.
 *
 * `shortYear` gives "14 Aug 27" instead, for lines too tight to spend four
 * characters on it. Same convention the stats chart's axis already uses.
 */
export function formatDay(value, { withYear = false, shortYear = false } = {}) {
  if (!value) return "";
  const d = dayFromYmd(value);
  const base = `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
  if (!withYear) return base;
  const year = d.getUTCFullYear();
  return `${base} ${shortYear ? String(year).slice(2) : year}`;
}

/**
 * A window as plain dates — "1 – 30 Sep", "25 Aug – 7 Sep", years only when it
 * crosses one. Unlike formatPeriodLabel this never collapses a whole calendar
 * month to its name, because the caller wants the span itself.
 */
export function formatDayRange(period, { shortYear = false } = {}) {
  if (!period) return "";
  const start = dayFromYmd(period.start);
  const end = dayFromYmd(period.end);
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  if (sameMonth) {
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${SHORT_MONTHS[end.getUTCMonth()]}`;
  }
  const crossesYear = start.getUTCFullYear() !== end.getUTCFullYear();
  return `${formatDay(period.start, { withYear: crossesYear, shortYear })} – ${formatDay(period.end, { withYear: crossesYear, shortYear })}`;
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

  return formatDayRange(period);
}

/** "August 2026" for the calendar month a day falls in. */
export function formatMonthLabel(value) {
  if (!value) return "";
  const d = dayFromYmd(value);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * What to say when there is no window running, per mode.
 *
 * Shared because three screens ask the same question — Home, Tracker and Plan
 * all render this state — and they had drifted into three answers. Term mode is
 * the one that made that visible: Home called it an allowance term while the
 * other two called it a budget period, for the same missing thing on the same
 * account.
 *
 * Month mode never reaches this: the calendar always supplies a window.
 *
 * `body` is the general-purpose sentence. A screen with something more specific
 * to say about its own contents passes its own; the title and the action are
 * what must not vary.
 */
export function noWindowCopy(mode, status) {
  const lapsed = status === "lapsed";
  if (mode === "term") {
    return {
      title: lapsed ? "Your Allowance Term Has Ended" : "No Allowance Term Set Up Yet",
      body: lapsed
        ? "Months since it ended aren't budgeted or counted towards your streak. Set up the next term to pick up where you left off."
        : "A term is one lump sum spread over several months — a semester's allowance, say. Set the months it covers and each one gets its share.",
      action: lapsed ? "Set Up Next Term" : "Set Up a Term",
    };
  }
  return {
    title: lapsed ? "Your Last Budget Period Has Ended" : "No Budget Period Running Yet",
    body: lapsed
      ? "Days since it ended aren't budgeted or counted towards your streak. Start the next one to pick up where you left off."
      : "Your budget runs over a stretch you choose — a fortnight, five weeks, however your money arrives. Start one and the rest follows.",
    action: lapsed ? "Start Next Period" : "Set Up a Period",
  };
}

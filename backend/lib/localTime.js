// Building a formatter is the expensive part; formatting with one is cheap.
const formatters = new Map();

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      // h23 rather than hour12:false, which reports midnight as "24" on some
      // ICU builds and would never match hour 0.
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone || timeZone.length > 64) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * The wall clock in `timeZone` at instant `date`: `{ dayKey, hour }`, or null
 * for a zone this runtime doesn't know.
 *
 * `dayKey` is a YYYY-MM-DD calendar label, the same thing Transaction.date
 * encodes as a UTC midnight.
 */
export function localWallClock(date, timeZone) {
  if (!isValidTimeZone(timeZone)) return null;
  const parts = formatterFor(timeZone).formatToParts(date);
  const at = (type) => parts.find((p) => p.type === type)?.value;
  const hour = Number(at("hour"));
  return {
    dayKey: `${at("year")}-${at("month")}-${at("day")}`,
    hour: hour === 24 ? 0 : hour,
  };
}

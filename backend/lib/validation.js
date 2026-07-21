const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_YEAR = 2000;
export const MAX_YEAR = new Date().getUTCFullYear() + 1;

export function ymd(date) {
  return date.toISOString().slice(0, 10);
}

export function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function parseYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || ymd(date) !== value) return null;
  return date;
}

export function resolveClientToday(value) {
  const serverToday = utcToday();
  if (value === undefined || value === "") return serverToday;
  const date = parseYmd(value);
  if (!date || Math.abs(date.getTime() - serverToday.getTime()) > DAY_MS) return null;
  return date;
}

export function parseTransactionDate(value) {
  const date = value ? parseYmd(value) : utcToday();
  if (!date) return null;
  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (date.getTime() - utcToday().getTime() > DAY_MS) return null;
  return date;
}

export function parseMonthYear(query) {
  const now = new Date();
  const month = query.month === undefined ? now.getMonth() : Number(query.month);
  const year = query.year === undefined ? now.getFullYear() : Number(query.year);
  if (!Number.isInteger(month) || month < 0 || month > 11) return null;
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return { month, year };
}

export const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
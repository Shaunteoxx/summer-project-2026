import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month) {
  return MONTH_NAMES[month] ?? "";
}

/** Client's local calendar date as YYYY-MM-DD (avoids server-timezone drift). */
export function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function formatMoney(value, currency = "$") {
  const n = Number(value) || 0;
  return `${n < 0 ? "-" : ""}${currency}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

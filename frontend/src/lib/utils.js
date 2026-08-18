import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be told about the custom type scale in
 * tailwind.config.js, because it cannot tell a font size named `caption` from a
 * colour named `caption`. Left to guess, it reads `text-caption text-ink-2` as
 * two classes fighting over the same property and drops the first — so every
 * <Label> rendered at the inherited 16px instead of 13px, and every
 * <CardDescription> at 16px instead of 12.5px, with the token nowhere in the
 * DOM to explain why. Any `text-*` size token added to tailwind.config.js has
 * to be listed here too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "overline",
            "meta",
            "caption",
            "body",
            "amount",
            "title",
            "title-lg",
            "display",
          ],
        },
      ],
    },
  },
});

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

/** 1 -> "1st", 22 -> "22nd". Used wherever a repeating entry names its day. */
export function ordinal(n) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${suffix}`;
}

/** Client's local calendar date as YYYY-MM-DD (avoids server-timezone drift). */
export function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

// SGD only for now, formatted the Singapore way. The locale is pinned rather
// than left to the runtime: `toLocaleString(undefined, …)` follows the reader's
// browser for separators, so a de-DE machine would render "$1.240,00" — our
// symbol, their decimal comma. In a money app that's an amount which reads as a
// different number.
//
// When a second currency is needed, this is the one place to change: swap the
// body for Intl.NumberFormat with { style: "currency", currency,
// currencyDisplay: "narrowSymbol" } and thread a stored ISO 4217 code through.
export const LOCALE = "en-SG";

export function formatMoney(value, currency = "$") {
  const n = Number(value) || 0;
  return `${n < 0 ? "-" : ""}${currency}${Math.abs(n).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

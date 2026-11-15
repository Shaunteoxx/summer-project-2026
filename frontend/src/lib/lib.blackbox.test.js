// Black-box tests for the frontend's pure helpers.
//
// Written from the exported names, their parameter lists and the documented
// behaviour (README design notes, HANDOFF.md, design/COPY_CONVENTIONS.md) —
// not from the implementations.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as period from "./period.js";
import * as calc from "./calc.js";
import * as utils from "./utils.js";
import * as ledger from "./ledger.js";
import * as cats from "./categories.js";
import * as badges from "./streakBadges.js";
import { streakMoment } from "./streakMoments.js";
import * as avatars from "./avatars.js";
import * as setup from "./setup.js";
import * as haptics from "./haptics.js";
import * as appIcon from "./appIcon.js";
import * as push from "./push.js";
// The server's copy of the same date maths. The client mirrors it, and the two
// must never disagree about where a period ends.
import * as serverPeriod from "../../../backend/lib/period.js";

// ───────────────────────────── lib/period.js ─────────────────────────────

describe("period: date helpers", () => {
  it("dayFromYmd is UTC midnight and ymdOf is its inverse", () => {
    expect(period.dayFromYmd("2026-03-05").toISOString()).toBe("2026-03-05T00:00:00.000Z");
    for (const k of ["2024-02-29", "2026-12-31", "2026-01-01", "2026-03-01"]) {
      expect(period.ymdOf(period.dayFromYmd(k))).toBe(k);
    }
  });

  it("addDaysYmd crosses month, year and leap-day boundaries", () => {
    expect(period.addDaysYmd("2026-01-31", 1)).toBe("2026-02-01");
    expect(period.addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(period.addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(period.addDaysYmd("2024-03-01", -1)).toBe("2024-02-29");
    expect(period.addDaysYmd("2026-03-05", 0)).toBe("2026-03-05");
  });

  it("daysBetween counts both ends", () => {
    expect(period.daysBetween("2026-03-01", "2026-03-10")).toBe(10);
    expect(period.daysBetween("2026-03-05", "2026-03-05")).toBe(1);
    expect(period.daysBetween("2026-02-27", "2026-03-02")).toBe(4);
    expect(period.daysBetween("2024-02-27", "2024-03-02")).toBe(5);
  });

  it("periodEnd is inclusive of the start day", () => {
    expect(period.periodEnd("2026-03-01", 1)).toBe("2026-03-01");
    expect(period.periodEnd("2026-02-20", 14)).toBe("2026-03-05");
    expect(period.periodEnd("2026-03-01", 31)).toBe("2026-03-31");
  });

  it("addMonthsYmd clamps to the end of shorter months", () => {
    expect(period.addMonthsYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(period.addMonthsYmd("2024-01-31", 1)).toBe("2024-02-29");
    expect(period.addMonthsYmd("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("termEnd is the day before the same date N months on", () => {
    expect(period.termEnd("2026-01-01", 6)).toBe("2026-06-30");
    expect(period.termEnd("2026-01-15", 3)).toBe("2026-04-14");
  });

  it("has the same limits as the server", () => {
    expect(period.MIN_PERIOD_DAYS).toBe(serverPeriod.MIN_PERIOD_DAYS);
    expect(period.MAX_PERIOD_DAYS).toBe(serverPeriod.MAX_PERIOD_DAYS);
    expect(period.MIN_TERM_MONTHS).toBe(serverPeriod.MIN_TERM_MONTHS);
    expect(period.MAX_TERM_MONTHS).toBe(serverPeriod.MAX_TERM_MONTHS);
  });

  it("agrees with the server on every date calculation", () => {
    const starts = ["2026-01-01", "2026-01-15", "2026-01-29", "2026-01-30", "2026-01-31", "2024-01-31", "2024-02-29", "2026-02-28", "2026-03-31", "2026-08-31", "2026-10-31", "2026-12-01", "2026-12-31"];
    for (const start of starts) {
      for (const n of [0, 1, 2, 6, 11, 12]) {
        expect(period.addMonthsYmd(start, n), `addMonthsYmd(${start}, ${n})`).toBe(serverPeriod.addMonthsYmd(start, n));
      }
      for (const months of [1, 2, 3, 6, 12]) {
        expect(period.termEnd(start, months), `termEnd(${start}, ${months})`).toBe(serverPeriod.termEnd(start, months));
      }
      for (const length of [1, 7, 14, 30, 31, 45, 180, 366]) {
        expect(period.periodEnd(start, length), `periodEnd(${start}, ${length})`).toBe(serverPeriod.periodEnd(start, length));
        const end = period.periodEnd(start, length);
        expect(period.daysBetween(start, end)).toBe(serverPeriod.daysBetween(start, end));
        expect(period.daysBetween(start, end)).toBe(length);
      }
      for (const n of [-400, -31, -1, 0, 1, 28, 365]) {
        expect(period.addDaysYmd(start, n)).toBe(serverPeriod.addDaysYmd(start, n));
      }
    }
  });
});

describe("period: daysLeftInPeriod counts today", () => {
  const p = { start: "2026-02-27", end: "2026-03-02", days: 4 };

  it("is the full length on the first day and 1 on the last", () => {
    expect(period.daysLeftInPeriod("2026-02-27", p)).toBe(4);
    expect(period.daysLeftInPeriod("2026-03-01", p)).toBe(2);
    expect(period.daysLeftInPeriod("2026-03-02", p)).toBe(1);
  });

  it("is zero after the period, and with no period", () => {
    expect(period.daysLeftInPeriod("2026-03-03", p)).toBe(0);
    expect(period.daysLeftInPeriod("2026-03-03", null)).toBe(0);
    expect(period.daysLeftInPeriod("2026-03-03", undefined)).toBe(0);
  });

  it("agrees with the server", () => {
    for (const today of ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02", "2026-03-03", "2026-04-01"]) {
      expect(period.daysLeftInPeriod(today, p)).toBe(serverPeriod.daysLeftInPeriod(today, p));
    }
  });
});

describe("period: periodDayList", () => {
  it("lists every day of a period, crossing the month boundary", () => {
    expect(period.periodDayList({ start: "2026-02-27", end: "2026-03-02" })).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("lists a whole month, a single day and a leap February", () => {
    expect(period.periodDayList({ start: "2026-03-01", end: "2026-03-31" })).toHaveLength(31);
    expect(period.periodDayList({ start: "2026-03-01", end: "2026-03-01" })).toEqual(["2026-03-01"]);
    const feb = period.periodDayList({ start: "2024-02-01", end: "2024-02-29" });
    expect(feb).toHaveLength(29);
    expect(feb.at(-1)).toBe("2024-02-29");
  });

  it("has no duplicates and no gaps over a year", () => {
    const days = period.periodDayList({ start: "2026-03-01", end: "2027-03-01" });
    expect(days).toHaveLength(366);
    expect(new Set(days).size).toBe(366);
    for (let i = 1; i < days.length; i += 1) expect(days[i]).toBe(period.addDaysYmd(days[i - 1], 1));
  });

  it("is empty when there is no period", () => {
    expect(period.periodDayList(null)).toEqual([]);
  });
});

describe("period: labels", () => {
  it("formatDay reads day-then-month, with the year only when asked", () => {
    expect(period.formatDay("2026-03-05")).toBe("5 Mar");
    expect(period.formatDay("2026-03-05", { withYear: true })).toBe("5 Mar 2026");
    expect(period.formatDay("2026-03-05", { withYear: true, shortYear: true })).toBe("5 Mar 26");
    expect(period.formatDay("2026-12-31")).toBe("31 Dec");
    expect(period.formatDay("2026-01-01")).toBe("1 Jan");
  });

  it("formatDay does not shift a day in any timezone", () => {
    // The key is a UTC date; a local-time formatter would print the day before
    // for anyone west of UTC, or the day after late at night east of it.
    expect(period.formatDay("2026-03-01")).toBe("1 Mar");
    expect(period.formatDay("2026-02-28")).toBe("28 Feb");
  });

  it("formatDayRange names both ends, adding years only when they differ", () => {
    expect(period.formatDayRange({ start: "2026-02-27", end: "2026-03-02" })).toBe("27 Feb – 2 Mar");
    expect(period.formatDayRange({ start: "2025-12-20", end: "2026-01-05" })).toBe("20 Dec 2025 – 5 Jan 2026");
  });

  it("formatPeriodLabel names a calendar month as the month", () => {
    expect(period.formatPeriodLabel({ start: "2026-03-01", end: "2026-03-31" }, { mode: "month" })).toBe("March 2026");
    expect(period.formatPeriodLabel({ start: "2026-02-01", end: "2026-02-28" }, { mode: "month" })).toBe("February 2026");
    expect(period.formatPeriodLabel({ start: "2026-12-01", end: "2026-12-31" }, { mode: "month" })).toBe("December 2026");
  });

  it("formatPeriodLabel names a whole-month term cycle as the month, and a clipped one by its days", () => {
    expect(period.formatPeriodLabel({ start: "2026-09-01", end: "2026-09-30" }, { mode: "term" })).toBe("September 2026");
    expect(period.formatPeriodLabel({ start: "2026-03-15", end: "2026-03-31" }, { mode: "term" })).toBe("15 – 31 Mar");
  });

  it("formatPeriodLabel names a custom period by its range", () => {
    expect(period.formatPeriodLabel({ start: "2026-02-27", end: "2026-03-02" })).toBe("27 Feb – 2 Mar");
    expect(period.formatPeriodLabel({ start: "2026-02-27", end: "2026-03-02" }, { mode: "days" })).toBe("27 Feb – 2 Mar");
  });

  it("formatPeriodLabel is empty, not a crash, with no period", () => {
    expect(period.formatPeriodLabel(null)).toBe("");
    expect(period.formatPeriodLabel(undefined, { mode: "month" })).toBe("");
  });

  it("formatMonthLabel names the month a date falls in", () => {
    expect(period.formatMonthLabel("2026-03-05")).toBe("March 2026");
    expect(period.formatMonthLabel("2026-03-01")).toBe("March 2026");
    expect(period.formatMonthLabel("2026-03-31")).toBe("March 2026");
    expect(period.formatMonthLabel("2026-12-31")).toBe("December 2026");
    expect(period.formatMonthLabel("2027-01-01")).toBe("January 2027");
  });

  it("noWindowCopy gives a title, a sentence and a button for every mode and state", () => {
    for (const mode of ["days", "term"]) {
      for (const status of ["none", "lapsed"]) {
        const copy = period.noWindowCopy(mode, status);
        expect(copy.title, `${mode}/${status}`).toBeTruthy();
        expect(copy.body, `${mode}/${status}`).toBeTruthy();
        expect(copy.action, `${mode}/${status}`).toBeTruthy();
      }
    }
  });

  it("noWindowCopy tells a lapsed window apart from never having had one", () => {
    expect(period.noWindowCopy("days", "lapsed").title).not.toBe(period.noWindowCopy("days", "none").title);
    expect(period.noWindowCopy("term", "lapsed").title).not.toBe(period.noWindowCopy("term", "none").title);
  });

  it("noWindowCopy speaks of a term in term mode and a period in days mode", () => {
    expect(JSON.stringify(period.noWindowCopy("term", "none")).toLowerCase()).toContain("term");
    expect(JSON.stringify(period.noWindowCopy("days", "none")).toLowerCase()).toContain("period");
    expect(JSON.stringify(period.noWindowCopy("days", "none")).toLowerCase()).not.toContain("term");
  });
});

// ────────────────────────────── lib/calc.js ──────────────────────────────

describe("calc: the amount keypad", () => {
  const press = (keys, from = calc.emptyState()) => keys.reduce((s, k) => calc.applyKey(s, k), from);
  const typed = (text) => press(text.split(""));

  it("starts empty", () => {
    expect(calc.emptyState()).toEqual({ tokens: [], sealed: false });
  });

  it("builds a number digit by digit", () => {
    expect(typed("125").tokens).toEqual(["125"]);
    expect(typed("12.5").tokens).toEqual(["12.5"]);
  });

  it("never mutates the state it was given", () => {
    const before = typed("12");
    const snapshot = JSON.stringify(before);
    calc.applyKey(before, "3");
    calc.applyKey(before, "+");
    calc.applyKey(before, "backspace");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("ignores a second decimal point", () => {
    expect(typed("12.5.5").tokens).toEqual(["12.55"]);
  });

  it("a leading point reads as zero-point", () => {
    expect(typed(".5").tokens).toEqual(["0.5"]);
  });

  it("stops at two decimal places — it is money", () => {
    expect(typed("1.239").tokens).toEqual(["1.23"]);
    expect(typed("0.999").tokens).toEqual(["0.99"]);
  });

  it("drops leading zeros", () => {
    expect(typed("005").tokens).toEqual(["5"]);
    expect(typed("0").tokens).toEqual(["0"]);
    expect(typed("0.5").tokens).toEqual(["0.5"]);
  });

  it("does not let a number grow without limit", () => {
    const { tokens } = typed("1".repeat(30));
    expect(tokens[0].length).toBeLessThanOrEqual(12);
  });

  it("an operator needs a number before it", () => {
    for (const op of calc.OPERATORS) expect(press([op]).tokens).toEqual([]);
  });

  it("a second operator replaces the first", () => {
    expect(press(["1", "+", "+", "2"]).tokens).toEqual(["1", "+", "2"]);
    expect(press(["1", "+", "×", "2"]).tokens).toEqual(["1", "×", "2"]);
  });

  it("backspace removes one character at a time, then the operator, then nothing", () => {
    let s = press(["1", "2", "+", "8"]);
    s = calc.applyKey(s, "backspace");
    expect(s.tokens).toEqual(["12", "+"]);
    s = calc.applyKey(s, "backspace");
    expect(s.tokens).toEqual(["12"]);
    s = calc.applyKey(s, "backspace");
    expect(s.tokens).toEqual(["1"]);
    s = calc.applyKey(s, "backspace");
    expect(s.tokens).toEqual([]);
    expect(calc.applyKey(s, "backspace").tokens).toEqual([]);
  });

  it("clear empties everything", () => {
    expect(calc.applyKey(press(["1", "2", "+", "8"]), "clear")).toEqual({ tokens: [], sealed: false });
  });

  it("equals works the sum out and seals the result", () => {
    expect(press(["1", "2", "+", "8", "="])).toEqual({ tokens: ["20"], sealed: true });
  });

  it("equals drops a dangling operator", () => {
    expect(press(["5", "+", "="])).toEqual({ tokens: ["5"], sealed: true });
  });

  it("equals on nothing stays nothing", () => {
    expect(press(["="]).tokens).toEqual([]);
  });

  it("a result is rounded to cents", () => {
    expect(press(["1", "0", "÷", "3", "="]).tokens).toEqual(["3.33"]);
    expect(press(["0", ".", "1", "+", "0", ".", "2", "="]).tokens).toEqual(["0.3"]);
    expect(press(["2", "÷", "3", "="]).tokens).toEqual(["0.67"]);
  });

  it("typing a digit after a result starts a new number; an operator carries on from it", () => {
    const result = press(["1", "2", "+", "8", "="]);
    expect(calc.applyKey(result, "7")).toEqual({ tokens: ["7"], sealed: false });
    expect(press(["+", "1"], result).tokens).toEqual(["20", "+", "1"]);
  });

  it("dividing by zero does not produce a result", () => {
    const s = press(["5", "÷", "0", "="]);
    expect(s.sealed).toBe(false);
    expect(calc.evaluate(s.tokens).error).toBeTruthy();
    expect(calc.evaluate(s.tokens).value).toBe(null);
  });

  it("an unknown key changes nothing", () => {
    const s = typed("12");
    for (const key of ["x", "Enter", "", null, undefined, "%", "("]) expect(calc.applyKey(s, key)).toEqual(s);
  });
});

describe("calc: evaluate", () => {
  const value = (...tokens) => calc.evaluate(tokens).value;

  it("multiplies and divides before it adds and subtracts", () => {
    expect(value("2", "+", "3", "×", "4")).toBe(14);
    expect(value("10", "−", "6", "÷", "2")).toBe(7);
    expect(value("2", "×", "3", "+", "4", "×", "5")).toBe(26);
  });

  it("works left to right within the same precedence", () => {
    expect(value("10", "−", "2", "−", "3")).toBe(5);
    expect(value("100", "÷", "10", "÷", "2")).toBe(5);
    expect(value("8", "÷", "4", "×", "2")).toBe(4);
  });

  it("a single number is itself", () => {
    expect(value("12.5")).toBe(12.5);
  });

  it("nothing has no value and no error", () => {
    expect(calc.evaluate([])).toEqual({ value: null, error: null });
  });

  it("can go negative — splitting a bill the wrong way round", () => {
    expect(value("5", "−", "8")).toBe(-3);
  });

  it("reports division by zero as an error, wherever it occurs", () => {
    expect(calc.evaluate(["5", "÷", "0"]).error).toBeTruthy();
    expect(calc.evaluate(["1", "+", "5", "÷", "0"]).error).toBeTruthy();
    expect(calc.evaluate(["5", "÷", "0", "+", "1"]).value).toBe(null);
    expect(calc.evaluate(["0", "÷", "5"])).toEqual({ value: 0, error: null });
  });

  it("recognises exactly the four keypad operators", () => {
    expect(calc.OPERATORS).toEqual(["÷", "×", "−", "+"]);
    calc.OPERATORS.forEach((op) => expect(calc.isOperator(op)).toBe(true));
    ["5", "=", ".", "", "12.5"].forEach((t) => expect(calc.isOperator(t)).toBe(false));
  });
});

describe("calc: formatting and seeding", () => {
  it("formatExpression spaces the operators", () => {
    expect(calc.formatExpression(["12", "+", "8"])).toBe("12 + 8");
    expect(calc.formatExpression(["5", "+"])).toBe("5 +");
    expect(calc.formatExpression([])).toBe("");
  });

  it("roundMoney rounds to cents without float dust", () => {
    expect(calc.roundMoney(1.005)).toBe(1.01);
    expect(calc.roundMoney(12.345)).toBe(12.35);
    expect(calc.roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(calc.roundMoney(10)).toBe(10);
  });

  it("stateFromValue seeds the keypad with an existing amount", () => {
    expect(calc.stateFromValue(12.5)).toEqual({ tokens: ["12.5"], sealed: true });
    expect(calc.stateFromValue("12.50")).toEqual({ tokens: ["12.5"], sealed: true });
    expect(calc.stateFromValue(40)).toEqual({ tokens: ["40"], sealed: true });
  });

  it("stateFromValue starts empty for nothing, zero or a negative", () => {
    for (const v of ["", null, undefined, 0, -5, "abc", NaN]) expect(calc.stateFromValue(v)).toEqual({ tokens: [], sealed: false });
  });

  it("a seeded amount evaluates back to itself", () => {
    for (const v of [0.01, 12.5, 999.99, 1234567.89]) {
      expect(calc.evaluate(calc.stateFromValue(v).tokens).value).toBe(v);
    }
  });
});

// ────────────────────────────── lib/utils.js ─────────────────────────────

describe("utils: money", () => {
  it("formatMoney always shows two decimals and groups thousands", () => {
    expect(utils.formatMoney(0)).toBe("$0.00");
    expect(utils.formatMoney(5)).toBe("$5.00");
    expect(utils.formatMoney(1234.5)).toBe("$1,234.50");
    expect(utils.formatMoney(1234567.891)).toBe("$1,234,567.89");
    expect(utils.formatMoney(0.005)).toBe("$0.01");
  });

  it("formatMoney puts the minus sign before the symbol", () => {
    expect(utils.formatMoney(-160)).toBe("-$160.00");
    expect(utils.formatMoney(-0.5)).toBe("-$0.50");
  });

  it.fails("formatMoney never prints a negative zero", () => {
    expect(utils.formatMoney(-0)).toBe("$0.00");
    // Float dust from client-side subtraction: 0.3 − 0.1 − 0.2 is −2.8e-17.
    expect(utils.formatMoney(0.3 - 0.1 - 0.2)).toBe("$0.00");
    expect(utils.formatMoney(-0.001)).toBe("$0.00");
  });

  it("formatMoney treats missing or broken numbers as zero", () => {
    for (const v of [undefined, null, NaN, "abc"]) expect(utils.formatMoney(v), String(v)).toBe("$0.00");
  });

  it("formatMoney does not follow the reader's browser locale", () => {
    expect(utils.LOCALE).toBe("en-SG");
    const spy = vi.spyOn(Intl, "NumberFormat");
    const text = utils.formatMoney(1240);
    expect(text).toBe("$1,240.00");
    spy.mockRestore();
  });

  it("formatMoney takes another symbol", () => {
    expect(utils.formatMoney(5, "€")).toBe("€5.00");
  });

  it("an expense counts net of what was paid back", () => {
    expect(utils.countedAmount({ type: "expense", amount: 10, paidBack: 4 })).toBe(6);
    expect(utils.countedAmount({ type: "expense", amount: 10 })).toBe(10);
    expect(utils.countedAmount({ type: "expense", amount: 10, paidBack: 10 })).toBe(0);
    expect(utils.countedAmount({ type: "expense", amount: 10, paidBack: 14 })).toBe(0);
    expect(utils.countedAmount({ type: "income", amount: 10 })).toBe(10);
  });

  it("being paid back more than the cost is a gain", () => {
    expect(utils.extraPaidBack({ type: "expense", amount: 10, paidBack: 14 })).toBe(4);
    expect(utils.extraPaidBack({ type: "expense", amount: 10, paidBack: 4 })).toBe(0);
    expect(utils.extraPaidBack({ type: "income", amount: 10 })).toBe(0);
    expect(utils.rowAmount({ type: "expense", amount: 10, paidBack: 14 })).toEqual({ gain: true, value: 4 });
    expect(utils.rowAmount({ type: "expense", amount: 10, paidBack: 4 })).toEqual({ gain: false, value: 6 });
    expect(utils.rowAmount({ type: "income", amount: 10 })).toEqual({ gain: true, value: 10 });
  });

  it("sumEntries totals the way the server does", () => {
    const rows = [
      { type: "income", amount: 100 },
      { type: "expense", amount: 30, paidBack: 5 },
      { type: "expense", amount: 10, paidBack: 14 },
      { type: "expense", amount: 0.1 },
      { type: "expense", amount: 0.2 },
    ];
    expect(utils.sumEntries(rows)).toEqual({ income: 104, spent: 25.3 });
    expect(utils.sumEntries([])).toEqual({ income: 0, spent: 0 });
  });
});

describe("utils: words and dates", () => {
  it("monthName takes a 0-based month", () => {
    expect(utils.monthName(0)).toBe("January");
    expect(utils.monthName(1)).toBe("February");
    expect(utils.monthName(11)).toBe("December");
  });

  it("monthName is empty for a month that does not exist", () => {
    expect(utils.monthName(12)).toBe("");
    expect(utils.monthName(-1)).toBe("");
    expect(utils.monthName(undefined)).toBe("");
  });

  it("ordinal handles the teens", () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 30, 31].map(utils.ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "13th", "14th", "20th", "21st", "22nd", "23rd", "24th", "30th", "31st",
    ]);
    expect([101, 111, 112, 113, 121].map(utils.ordinal)).toEqual(["101st", "111th", "112th", "113th", "121st"]);
  });

  it("cn joins class names and drops the falsy ones", () => {
    expect(utils.cn("a", false, null, undefined, "", "c")).toBe("a c");
    expect(utils.cn("p-2", "p-4")).toBe("p-4"); // later Tailwind class wins
  });

  describe("localToday is the device's date, not UTC's", () => {
    afterEach(() => { vi.useRealTimers(); });

    it("is YYYY-MM-DD", () => {
      expect(utils.localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("zero-pads and reads the local calendar", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 5, 9, 0, 0)); // 5 March, 09:00 local
      expect(utils.localToday()).toBe("2026-03-05");
    });

    it("rolls over at local midnight on the 1st, whatever UTC says", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 1, 0, 30, 0)); // 1 March, 00:30 local
      expect(utils.localToday()).toBe("2026-03-01");
      vi.setSystemTime(new Date(2026, 1, 28, 23, 59, 0)); // 28 February, 23:59 local
      expect(utils.localToday()).toBe("2026-02-28");
      vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
      expect(utils.localToday()).toBe("2026-12-31");
      vi.setSystemTime(new Date(2027, 0, 1, 0, 0, 1));
      expect(utils.localToday()).toBe("2027-01-01");
    });
  });
});

// ────────────────────────────── lib/ledger.js ────────────────────────────

describe("ledger", () => {
  const row = (id, day, extra = {}) => ({ _id: id, date: `${day}T00:00:00.000Z`, type: "expense", amount: 5, description: `entry ${id}`, category: "F & B", ...extra });
  const rows = [
    row("1", "2026-03-10"),
    row("2", "2026-03-10", { type: "income", amount: 50, category: "Allowance" }),
    row("3", "2026-03-09", { description: "Kopi", paidBack: 2 }),
    row("4", "2026-03-01", { accountId: "a1", category: "Transport" }),
    row("5", "2026-02-28"),
  ];
  const view = (over = {}) => ledger.ledgerView({ transactions: rows, transfers: [], filter: "all", accountFilter: null, query: "", getAccount: () => null, ...over });
  const ids = (v) => v.visibleTransactions.map((t) => t._id);

  it("rowKey prefers the key a row was given before it was saved", () => {
    expect(ledger.rowKey({ _id: "9" })).toBe("9");
    expect(ledger.rowKey({ clientKey: "c1", _id: "9" })).toBe("c1");
    expect(ledger.rowKey({ clientKey: "c1" })).toBe("c1");
  });

  it("groups entries by the day they are dated, in the order they arrived", () => {
    const { days } = view();
    expect(days.map((d) => d.key)).toEqual(["2026-03-10", "2026-03-09", "2026-03-01", "2026-02-28"]);
    expect(days[0].entries.map((e) => e.row._id)).toEqual(["1", "2"]);
  });

  it("keeps the 1st and the last day of the month before as separate days", () => {
    // Dates are stored at UTC midnight; reading them in local time would fold
    // one into the other for anyone away from UTC.
    const { days } = view();
    expect(days.find((d) => d.key === "2026-03-01").entries).toHaveLength(1);
    expect(days.find((d) => d.key === "2026-02-28").entries).toHaveLength(1);
  });

  it("a day's net is income less spending, counting an expense net of what was paid back", () => {
    const { days } = view();
    expect(days.find((d) => d.key === "2026-03-10").net).toBe(45);
    expect(days.find((d) => d.key === "2026-03-09").net).toBe(-3);
  });

  it("filters by type", () => {
    expect(ids(view({ filter: "income" }))).toEqual(["2"]);
    expect(ids(view({ filter: "expense" }))).toEqual(["1", "3", "4", "5"]);
    expect(ids(view({ filter: "all" }))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("searches the description and the category, ignoring case", () => {
    expect(ids(view({ query: "KOPI" }))).toEqual(["3"]);
    expect(ids(view({ query: "transport" }))).toEqual(["4"]);
    expect(ids(view({ query: "  kopi  " }))).toEqual(["3"]);
    expect(ids(view({ query: "zzzz" }))).toEqual([]);
  });

  it("filters by account", () => {
    expect(ids(view({ accountFilter: "a1" }))).toEqual(["4"]);
  });

  it("combines the filters", () => {
    expect(ids(view({ filter: "expense", query: "f & b" }))).toEqual(["1", "3", "5"]);
    expect(ids(view({ filter: "income", query: "kopi" }))).toEqual([]);
  });

  it("shows a transfer on its day without it touching the day's net", () => {
    const transfer = { _id: "t1", from: "a1", to: "a2", amount: 900, date: "2026-03-09T00:00:00.000Z" };
    const { days, visibleTransactions } = view({ transfers: [transfer] });
    const day = days.find((d) => d.key === "2026-03-09");
    expect(day.entries.map((e) => e.kind).sort()).toEqual(["transfer", "txn"]);
    expect(day.net).toBe(-3);
    expect(visibleTransactions.map((t) => t._id)).not.toContain("t1");
  });

  it("a transfer is neither income nor an expense, so those filters hide it", () => {
    const transfer = { _id: "t1", from: "a1", to: "a2", amount: 900, date: "2026-03-09T00:00:00.000Z" };
    for (const filter of ["income", "expense"]) {
      const kinds = view({ transfers: [transfer], filter }).visible.map((e) => e.kind);
      expect(kinds, filter).not.toContain("transfer");
    }
  });

  it("an empty ledger has no days", () => {
    const v = ledger.ledgerView({ transactions: [], transfers: [], filter: "all", accountFilter: null, query: "", getAccount: () => null });
    expect(v.days).toEqual([]);
    expect(v.visibleTransactions).toEqual([]);
  });
});

// ──────────────────────────── lib/categories.js ──────────────────────────

describe("categories", () => {
  it("has the documented fixed sets", () => {
    expect(cats.EXPENSE_CATEGORIES.map((c) => c.name)).toEqual(["F & B", "Transport", "Shopping", "Entertainment", "Travel"]);
    expect(cats.INCOME_CATEGORIES.map((c) => c.name)).toEqual(["Allowance", "Job", "Gifts"]);
    expect(cats.CATEGORIES_BY_TYPE.expense).toBe(cats.EXPENSE_CATEGORIES);
    expect(cats.CATEGORIES_BY_TYPE.income).toBe(cats.INCOME_CATEGORIES);
  });

  it("every fixed category has a hex colour and an icon, so meaning never rests on colour alone", () => {
    for (const c of [...cats.EXPENSE_CATEGORIES, ...cats.INCOME_CATEGORIES]) {
      expect(c.color, c.name).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.icon, c.name).toBeTruthy();
    }
  });

  it("no two fixed categories share a colour", () => {
    const colours = cats.EXPENSE_CATEGORIES.map((c) => c.color.toLowerCase());
    expect(new Set(colours).size).toBe(colours.length);
  });

  it("offers six custom colours, none of them an expense category's", () => {
    expect(cats.CUSTOM_COLOR_OPTIONS).toHaveLength(6);
    const taken = new Set(cats.EXPENSE_CATEGORIES.map((c) => c.color.toLowerCase()));
    for (const option of cats.CUSTOM_COLOR_OPTIONS) {
      const hex = (typeof option === "string" ? option : option.color ?? option.value).toLowerCase();
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(taken.has(hex), hex).toBe(false);
    }
  });

  it("getCategory finds a fixed category by name", () => {
    expect(cats.getCategory("Transport").name).toBe("Transport");
    expect(cats.getCategory("Job").name).toBe("Job");
  });

  it("getCategory falls back to a grey 'unknown' rather than failing", () => {
    const unknown = cats.getCategory("Part-time");
    expect(unknown.name).toBe("Part-time");
    expect(unknown.color).toBe(cats.FALLBACK_COLOR);
    expect(unknown.icon).toBeTruthy();
    expect(cats.getCategory(undefined).color).toBe(cats.FALLBACK_COLOR);
  });

  it("categoryColor switches to the dark palette in dark mode", () => {
    const transport = cats.getCategory("Transport");
    expect(cats.categoryColor(transport, false)).toBe(transport.color);
    expect(cats.categoryColor(transport, true)).toBe(cats.CATEGORY_COLORS_DARK.Transport);
    expect(cats.categoryColor(transport, true)).not.toBe(transport.color);
  });

  it("categoryColor has a fallback for both themes", () => {
    expect(cats.categoryColor(undefined, false)).toBe(cats.FALLBACK_COLOR);
    expect(cats.categoryColor(undefined, true)).toBe(cats.FALLBACK_COLOR_DARK);
  });

  it.fails("an unknown category gets the dark fallback in dark mode, not the light one", () => {
    // e.g. an entry filed under a custom category that has since been deleted.
    expect(cats.categoryColor(cats.getCategory("Nope"), false)).toBe(cats.FALLBACK_COLOR);
    expect(cats.categoryColor(cats.getCategory("Nope"), true)).toBe(cats.FALLBACK_COLOR_DARK);
  });

  it("a custom category keeps its own colour in both themes", () => {
    const custom = { name: "Pets", color: "#aabbcc" };
    expect(cats.categoryColor(custom, false)).toBe("#aabbcc");
    expect(cats.categoryColor(custom, true)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("every fixed category has a dark-mode colour", () => {
    for (const c of [...cats.EXPENSE_CATEGORIES, ...cats.INCOME_CATEGORIES]) {
      expect(cats.CATEGORY_COLORS_DARK[c.name], c.name).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(cats.categoryColor(c, true), c.name).toBe(cats.CATEGORY_COLORS_DARK[c.name]);
    }
  });
});

// ─────────────────────────── lib/streakBadges.js ─────────────────────────

describe("streak badges: one step up the ladder every five days", () => {
  it("climbs Bronze → Silver → Gold → Platinum → Sapphire → Amethyst → Diamond", () => {
    expect(badges.DAYS_PER_BADGE).toBe(5);
    expect(badges.BADGES.map((b) => b.name)).toEqual(["Bronze", "Silver", "Gold", "Platinum", "Sapphire", "Amethyst", "Diamond"]);
  });

  it("has no badge before day five", () => {
    for (const d of [0, 1, 4]) {
      expect(badges.tierFor(d)).toBe(0);
      expect(badges.badgeFor(d)).toBe(null);
    }
  });

  it("awards each badge on its fifth day exactly", () => {
    const names = ["Bronze", "Silver", "Gold", "Platinum", "Sapphire", "Amethyst", "Diamond"];
    names.forEach((name, i) => {
      const day = (i + 1) * 5;
      expect(badges.badgeFor(day - 1)?.name ?? null, `day ${day - 1}`).toBe(i === 0 ? null : names[i - 1]);
      expect(badges.badgeFor(day).name, `day ${day}`).toBe(name);
      expect(badges.badgeFor(day).days).toBe(day);
      expect(badges.badgeFor(day + 4).name, `day ${day + 4}`).toBe(name);
    });
  });

  it("keeps counting past Diamond: Diamond 2, Diamond 3 …", () => {
    expect(badges.badgeFor(35).label).toBe("Diamond");
    expect(badges.badgeFor(40).label).toBe("Diamond 2");
    expect(badges.badgeFor(45).label).toBe("Diamond 3");
    expect(badges.badgeFor(365).label).toBe(`Diamond ${73 - 6}`);
    expect(badges.badgeFor(365).name).toBe("Diamond");
  });

  it("badgeAt and badgeFor agree", () => {
    for (const days of [5, 12, 35, 44, 100]) {
      expect(badges.badgeAt(badges.tierFor(days))).toEqual(badges.badgeFor(days));
    }
    expect(badges.badgeAt(0)).toBe(null);
  });

  it("nextBadge says what is next and how many days away", () => {
    expect(badges.nextBadge(0).name).toBe("Bronze");
    expect(badges.nextBadge(0).daysToGo).toBe(5);
    expect(badges.nextBadge(4).daysToGo).toBe(1);
    expect(badges.nextBadge(5).name).toBe("Silver");
    expect(badges.nextBadge(5).daysToGo).toBe(5);
    expect(badges.nextBadge(33).name).toBe("Diamond");
    expect(badges.nextBadge(33).daysToGo).toBe(2);
    expect(badges.nextBadge(35).label).toBe("Diamond 2");
  });

  it("the next badge is always 1–5 days away", () => {
    for (let d = 0; d < 120; d += 1) {
      const { daysToGo, days } = badges.nextBadge(d);
      expect(daysToGo, `day ${d}`).toBeGreaterThanOrEqual(1);
      expect(daysToGo, `day ${d}`).toBeLessThanOrEqual(5);
      expect(days).toBe(d + daysToGo);
    }
  });

  it("progressToNext is the fraction of the way to the next badge", () => {
    expect(badges.progressToNext(0)).toBe(0);
    expect(badges.progressToNext(3)).toBeCloseTo(0.6);
    expect(badges.progressToNext(5)).toBe(0);
    expect(badges.progressToNext(7)).toBeCloseTo(0.4);
    for (let d = 0; d < 60; d += 1) {
      expect(badges.progressToNext(d)).toBeGreaterThanOrEqual(0);
      expect(badges.progressToNext(d)).toBeLessThan(1);
    }
  });

  it("a negative or empty streak has no badge", () => {
    for (const d of [-1, -5, null]) expect(badges.badgeFor(d), String(d)).toBe(null);
  });

  it.fails("a streak that has not loaded yet has no badge, rather than crashing the card", () => {
    for (const d of [undefined, NaN]) {
      expect(() => badges.badgeFor(d), `badgeFor(${d})`).not.toThrow();
      expect(() => badges.nextBadge(d), `nextBadge(${d})`).not.toThrow();
    }
  });
});

// ─────────────────────────── lib/streakMoments.js ────────────────────────

describe("streak moments: a rise is celebrated once, on the first look of a new day", () => {
  beforeEach(() => { localStorage.clear(); });

  it("the very first look is a baseline, not a celebration", () => {
    expect(streakMoment({ currentStreak: 5, longestStreak: 5 }, "2026-03-10")).toBe(null);
  });

  it("a rise on a new day is celebrated, and only once", () => {
    streakMoment({ currentStreak: 5, longestStreak: 5 }, "2026-03-10");
    const moment = streakMoment({ currentStreak: 6, longestStreak: 6 }, "2026-03-11");
    expect(moment).toBeTruthy();
    expect(streakMoment({ currentStreak: 6, longestStreak: 6 }, "2026-03-11")).toBe(null);
  });

  it("the same streak on a later look the same day is not celebrated", () => {
    streakMoment({ currentStreak: 5, longestStreak: 5 }, "2026-03-10");
    expect(streakMoment({ currentStreak: 5, longestStreak: 5 }, "2026-03-10")).toBe(null);
  });

  it("a streak that fell or stood still is not celebrated", () => {
    streakMoment({ currentStreak: 5, longestStreak: 5 }, "2026-03-10");
    expect(streakMoment({ currentStreak: 0, longestStreak: 5 }, "2026-03-11")).toBe(null);
    expect(streakMoment({ currentStreak: 0, longestStreak: 5 }, "2026-03-12")).toBe(null);
  });

  it("works across the month boundary", () => {
    streakMoment({ currentStreak: 9, longestStreak: 9 }, "2026-02-28");
    expect(streakMoment({ currentStreak: 10, longestStreak: 10 }, "2026-03-01")).toBeTruthy();
  });

  it("survives unreadable saved state", () => {
    localStorage.setItem("bnm_streak_seen", "{not json");
    expect(() => streakMoment({ currentStreak: 5, longestStreak: 5 }, "2026-03-10")).not.toThrow();
  });

  it("one person's streak is not celebrated as a rise for the next person on the device", () => {
    const tokenFor = (id) => `h.${btoa(JSON.stringify({ id }))}.s`;
    localStorage.setItem("bnm_token", tokenFor("user-a"));
    streakMoment({ currentStreak: 2, longestStreak: 2 }, "2026-03-10");
    localStorage.setItem("bnm_token", tokenFor("user-b"));
    expect(streakMoment({ currentStreak: 30, longestStreak: 30 }, "2026-03-11")).toBe(null);
  });
});

// ───────────────────────── avatars, setup, device bits ───────────────────

describe("avatars", () => {
  it("every avatar has an id and a picture in /avatars", () => {
    expect(avatars.AVATAR_IDS).toEqual(avatars.AVATARS.map((a) => a.id));
    expect(new Set(avatars.AVATAR_IDS).size).toBe(avatars.AVATAR_IDS.length);
    for (const id of avatars.AVATAR_IDS) expect(avatars.avatarSrc(id)).toBe(`/avatars/${id}.svg`);
  });

  it("an unknown or missing avatar has no picture, so the fallback chain can continue", () => {
    for (const id of ["nope", "", null, undefined, "../../etc/passwd"]) expect(avatars.avatarSrc(id)).toBe(null);
  });

  it("monogramToken gives a name the same colour every time", () => {
    for (const name of ["Shaun", "bob", "", "élan", "9lives"]) {
      expect(avatars.monogramToken(name)).toBe(avatars.monogramToken(name));
      expect(typeof avatars.monogramToken(name)).toBe("string");
      expect(avatars.monogramToken(name).length).toBeGreaterThan(0);
    }
    expect(avatars.monogramToken()).toBeTruthy();
  });
});

describe("setup checklist", () => {
  it("month mode asks for income, then a savings target, then a first spend", () => {
    expect(setup.setupSteps("month").map((s) => s.go)).toEqual(["income", "savings", "expense"]);
  });

  it("days and term mode start by setting up the window", () => {
    expect(setup.setupSteps("days").map((s) => s.go)).toEqual(["period", "income", "savings", "expense"]);
    expect(setup.setupSteps("term").map((s) => s.go)).toEqual(["period", "income", "savings", "expense"]);
  });

  it("an unknown mode falls back to the default checklist", () => {
    expect(setup.setupSteps(undefined).map((s) => s.go)).toEqual(["income", "savings", "expense"]);
    expect(setup.setupSteps("weeks").map((s) => s.go)).toEqual(["income", "savings", "expense"]);
  });

  it("every step has text and a title-case button label", () => {
    for (const mode of ["month", "days", "term"]) {
      for (const step of setup.setupSteps(mode)) {
        expect(step.text, `${mode}/${step.go}`).toBeTruthy();
        const label = setup.stepLabel(step.go, mode);
        expect(label, `${mode}/${step.go}`).toBeTruthy();
        expect(label[0]).toBe(label[0].toUpperCase());
      }
    }
  });

  it("term mode talks about a term, days mode about a period", () => {
    expect(setup.setupSteps("term")[0].text.toLowerCase()).toContain("term");
    expect(setup.setupSteps("days")[0].text.toLowerCase()).toContain("period");
  });
});

describe("haptics switch", () => {
  beforeEach(() => { localStorage.clear(); });

  it("is on until switched off, per device", () => {
    expect(haptics.hapticsEnabled()).toBe(true);
    haptics.setHapticsEnabled(false);
    expect(haptics.hapticsEnabled()).toBe(false);
    expect(localStorage.getItem("bnm_haptics")).toBe("off");
    haptics.setHapticsEnabled(true);
    expect(haptics.hapticsEnabled()).toBe(true);
  });

  it("never vibrates when switched off", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    haptics.setHapticsEnabled(false);
    haptics.haptic("tick");
    haptics.haptic("success");
    expect(vibrate).not.toHaveBeenCalled();
    delete navigator.vibrate;
  });

  it("is safe to call where vibration does not exist", () => {
    expect(() => haptics.haptic()).not.toThrow();
    expect(() => haptics.haptic("no-such-kind")).not.toThrow();
  });
});

describe("app icon", () => {
  beforeEach(() => { localStorage.clear(); });

  it("offers the wallet and the piggy bank, wallet by default", () => {
    expect(appIcon.APP_ICONS.map((i) => i.id)).toEqual(["wallet", "piggy"]);
    expect(appIcon.appIcon().id).toBe("wallet");
  });

  it("remembers the chosen icon", () => {
    appIcon.setAppIcon("piggy");
    expect(appIcon.appIcon().id).toBe("piggy");
    appIcon.setAppIcon("wallet");
    expect(appIcon.appIcon().id).toBe("wallet");
  });

  it("ignores an icon that does not exist", () => {
    appIcon.setAppIcon("piggy");
    appIcon.setAppIcon("letter-b");
    expect(["piggy", "wallet"]).toContain(appIcon.appIcon().id);
    expect(appIcon.appIcon().src).toBeTruthy();
  });

  it("only offers the choice on iOS", () => {
    expect(appIcon.canChooseAppIcon()).toBe(false);
  });
});

describe("push helpers", () => {
  it("converts a URL-safe base64 key into bytes", () => {
    expect(Array.from(push.urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(push.urlBase64ToUint8Array("AQI"))).toEqual([1, 2]); // padding restored
    expect(Array.from(push.urlBase64ToUint8Array("-_8"))).toEqual([251, 255]); // URL-safe alphabet
    expect(push.urlBase64ToUint8Array("AQID")).toBeInstanceOf(Uint8Array);
  });

  it("a real VAPID public key decodes to 65 bytes", () => {
    const key = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
    const bytes = push.urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it("reports no push support where the browser has none", () => {
    expect(push.pushSupported()).toBe(false);
    expect(push.isIos()).toBe(false);
    expect(push.isStandalone()).toBe(false);
  });

  it("detects a real IANA timezone", () => {
    const tz = push.detectedTimeZone();
    expect(() => new Intl.DateTimeFormat("en", { timeZone: tz })).not.toThrow();
  });

  it("has no current subscription without a service worker", async () => {
    await expect(push.currentSubscription()).resolves.toBe(null);
  });
});
